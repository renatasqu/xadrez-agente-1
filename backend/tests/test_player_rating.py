import json
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import chess
import pytest
import games, progresso, player_rating as rating
from tests.test_authorization import client, login
from tests.test_games import intent

@pytest.mark.parametrize('before,opponent,score,after',[(1200,1200,1,1216),(1200,1200,.5,1200),(1200,1200,0,1184),(1000,1400,1,1029),(1400,1000,1,1403),(1000,1400,0,997),(1400,1000,0,1371),(1201,1200,.5,1201)])
def test_formula(before,opponent,score,after):
    assert rating.calculate(before,opponent,score)==after==rating.calculate(before,opponent,score)

def fixture_game(color='black',agent='balanced',draw=False):
    game=games.create_game('a@example.com',color,agent_id=agent)
    fen='7k/8/5KQ1/8/8/8/8/8 b - - 0 1' if draw else chess.STARTING_FEN
    moves=[] if draw else ['f2f3','e7e5','g2g4','d8h4']
    with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET initial_fen=?,moves_json=?,version=? WHERE id=?',(fen,json.dumps(moves),len(moves),game.id))
    return games.get_game(game.id,'a@example.com')

def reconcile(g):return games.reconcile_rating(g.id,games.AgentMoveRequest(version=g.version),{'email':'a@example.com'})

def test_lazy_active_migration(client):
    login(client);assert client.get('/rating').json()==dict(rating=1200,initial_rating=1200,games_rated=0,rating_system='internal_elo',rating_system_version=1)
    assert client.get('/rating').headers['cache-control']=='no-store'
    g=games.create_game('a@example.com','white');assert reconcile(g).rating_change is None
    assert client.get('/rating/history').json()==[]
    games.criar_tabelas();games.criar_tabelas();assert client.get('/rating').json()['rating']==1200

@pytest.mark.parametrize('color,draw,score',[('white',False,0),('black',False,1),('white',True,.5),('black',True,.5)])
@pytest.mark.parametrize('agent',['balanced','hans_inspired'])
def test_results_reads_retry_and_color(client,color,draw,score,agent):
    login(client);g=fixture_game(color,agent,draw)
    for suffix in ['','/replay','/pgn']:assert client.get('/games/'+g.id+suffix).status_code==200
    if not draw and color=='white':client.get(f'/games/{g.id}/commentary?version=4&ply=4')
    assert client.get('/rating/history').json()==[]
    result=reconcile(g);opponent=1200 if agent=='balanced' else 1400
    assert result.rating_change['after']==rating.calculate(1200,opponent,score)
    before=client.get('/rating').json()
    for _ in range(3):
        assert reconcile(g).rating_change==result.rating_change
        for suffix in ['','/replay','/pgn']:client.get('/games/'+g.id+suffix)
    assert client.get('/rating').json()==before and before['games_rated']==1
    e=client.get('/rating/history').json()[0]
    assert e['score']==score and e['opponent_rating']==opponent and e['profile_version']==e['rating_system_version']==1
    assert 'account' not in e and 'owner' not in e

@pytest.mark.parametrize('human',[True,False])
def test_official_finishing_move(client,human):
    login(client);g=games.create_game('a@example.com','black' if human else 'white')
    with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET moves_json=?,version=3 WHERE id=?',(json.dumps(['f2f3','e7e5','g2g4']),g.id))
    request=games.HumanMove(**intent('d8h4',3))
    class Mate:
        def choose_move(self,*a):return 'd8h4'
    result=games.submit_human_move(g.id,'a@example.com',request) if human else games.execute_agent(games.get_game(g.id,'a@example.com'),'a@example.com',Mate())
    assert result.terminal and result.rating_change['after']==(1216 if human else 1184)
    if human:assert games.submit_human_move(g.id,'a@example.com',request).rating_change==result.rating_change
    assert client.get('/rating').json()['games_rated']==1

@pytest.mark.parametrize('same',[True,False])
def test_concurrency(client,same):
    first=fixture_game();second=first if same else fixture_game()
    with ThreadPoolExecutor(2) as pool:list(pool.map(reconcile,[first,second]))
    with closing(progresso._conectar()) as db:
        events=db.execute('SELECT rating_before,rating_after FROM rating_events ORDER BY created_at').fetchall()
        state=db.execute('SELECT current_rating,games_rated FROM player_ratings').fetchone()
    assert len(events)==(1 if same else 2)
    assert tuple(state)==(1216 if same else rating.calculate(1216,1200,1),1 if same else 2)
    if not same:assert events[1][0]==events[0][1]

def test_rollback_after_event(client,monkeypatch):
    g=games.create_game('a@example.com','black')
    with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET moves_json=?,version=3 WHERE id=?',(json.dumps(['f2f3','e7e5','g2g4']),g.id))
    original=rating.apply_terminal
    def fail(db,*args):original(db,*args);raise RuntimeError('simulated')
    monkeypatch.setattr(rating,'apply_terminal',fail)
    with pytest.raises(RuntimeError):games.submit_human_move(g.id,'a@example.com',games.HumanMove(**intent('d8h4',3)))
    assert games.get_game(g.id,'a@example.com').version==3
    with closing(progresso._conectar()) as db:
        assert db.execute('SELECT COUNT(*) FROM rating_events').fetchone()[0]==0
        assert db.execute('SELECT COUNT(*) FROM player_ratings').fetchone()[0]==0

def test_accounts_history_limits_security(client):
    g=fixture_game();reconcile(g)
    for url in ['/rating','/rating/history']:assert client.get(url).status_code==401
    assert client.post(f'/games/{g.id}/rating',json={'version':4}).status_code==401
    login(client,'b@example.com');assert client.get('/rating').json()['rating']==1200 and client.get('/rating/history').json()==[]
    assert client.post(f'/games/{g.id}/rating',json={'version':4}).status_code==404
    login(client)
    for field in ['rating_after','opponent_rating','delta','score','result','owner']:
        assert client.post(f'/games/{g.id}/rating',json={'version':4,field:999}).status_code==422
        assert client.post('/games',json={field:999}).status_code==422
    assert client.get('/rating?owner=b@example.com').json()['rating']==1216
    for query in ['limit=0','limit=51','offset=-1','offset=10001','limit=abc']:assert client.get('/rating/history?'+query).status_code==422
    other=fixture_game('white');reconcile(other)
    assert client.get('/rating/history?limit=1').json()[0]['game_id']==other.id
    assert client.get('/rating/history?limit=1&offset=1').json()[0]['game_id']==g.id
    games.criar_tabelas();assert client.get('/rating').json()['games_rated']==2

@pytest.mark.parametrize('agent',['magnus_inspired','hans_inspired','judit_inspired'])
def test_inspired_internal(client,agent):assert reconcile(fixture_game(agent=agent)).rating_change['opponent_rating']==1400

def test_unknown_legacy_profile(client):
    g=fixture_game()
    with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET profile_version=99 WHERE id=?',(g.id,))
    g=games.get_game(g.id,'a@example.com');assert g.terminal and g.profile is None and reconcile(g).rating_change is None

@pytest.mark.parametrize('color,after',[('white',1216),('black',1184)])
def test_white_winner_mapping(client,color,after):
    g=games.create_game('a@example.com',color)
    with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET initial_fen=? WHERE id=?',('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',g.id))
    assert reconcile(games.get_game(g.id,'a@example.com')).rating_change['after']==after

@pytest.mark.parametrize('fen,moves,status',[
 ('7k/8/8/8/8/8/8/K7 w - - 0 1',[],'insufficient_material'),
 ('7k/8/8/8/8/8/8/R6K w - - 100 51',[],'fifty_move'),
 (chess.STARTING_FEN,['g1f3','g8f6','f3g1','f6g8']*2,'repetition')])
def test_other_terminal_draws(client,fen,moves,status):
    g=games.create_game('a@example.com','white')
    with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET initial_fen=?,moves_json=?,version=? WHERE id=?',(fen,json.dumps(moves),len(moves),g.id))
    g=games.get_game(g.id,'a@example.com');assert g.status==status
    assert reconcile(g).rating_change==dict(before=1200,after=1200,delta=0,result='draw',opponent_rating=1200,rating_system_version=1)

def test_concurrent_official_finish(client):
    g=games.create_game('a@example.com','black')
    with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET moves_json=?,version=3 WHERE id=?',(json.dumps(['f2f3','e7e5','g2g4']),g.id))
    requests=[games.HumanMove(**intent('d8h4',3)) for _ in range(2)]
    def finish(r):
        try:return games.submit_human_move(g.id,'a@example.com',r)
        except games.GameError as e:return e.code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(finish,requests))
    assert sum(isinstance(r,games.Game) for r in results)==1 and 'stale_game_version' in results
    with closing(progresso._conectar()) as db:assert db.execute('SELECT COUNT(*) FROM rating_events').fetchone()[0]==1

def test_server_restart_and_sql_unique(client):
    from fastapi.testclient import TestClient
    import main,sqlite3
    login(client);g=fixture_game();reconcile(g);before=client.get('/rating').json()
    with TestClient(main.app) as restarted:
        restarted.cookies.update(client.cookies)
        assert restarted.get('/rating').json()==before
        assert restarted.post(f'/games/{g.id}/rating',json={'version':4}).status_code==200
        assert restarted.get('/rating').json()==before
    with closing(progresso._conectar()) as db,db:
        with pytest.raises(sqlite3.IntegrityError):db.execute('INSERT INTO rating_events SELECT * FROM rating_events')

@pytest.mark.parametrize('agent,opponent',[('training_beginner',1000),('stockfish',1200)])
def test_beginner_and_legacy_alias_rating(client,agent,opponent):
    assert reconcile(fixture_game(agent=agent)).rating_change['opponent_rating']==opponent

def test_analysis_and_comment_do_not_rate(client,monkeypatch):
    login(client);g=fixture_game('white')
    def forbidden(*a,**kw):pytest.fail('Read-only operation applied rating')
    monkeypatch.setattr(rating,'apply_terminal',forbidden)
    assert client.post('/analisar',json={'fen':g.current_fen}).status_code==200
    assert client.post(f'/games/{g.id}/review',json={'version':4,'ply':4}).status_code==200
    assert client.get(f'/games/{g.id}/commentary?version=4&ply=4').status_code==200
    assert client.get('/rating/history').json()==[]
