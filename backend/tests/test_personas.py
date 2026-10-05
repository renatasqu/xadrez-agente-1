"""Personas locais: não recebem Game nem controlam movimentos."""
import io
import json
from dataclasses import FrozenInstanceError
from contextlib import closing
import chess
import chess.pgn
import pytest
import games
import main
import progresso
import chess_engine
import game_commentary
from agent_profiles import PROFILES, DIFFICULTIES, resolve_profile
from agent_personas import resolve_persona
from agent_policy import StockfishPolicy, select_candidate
from tests.test_authorization import client, login
from tests.test_games import intent

INSPIRED=['magnus_inspired','hans_inspired','judit_inspired']


class Policy:
    def choose_move(self,board,legal,config):
        return 'e7e5' if 'e7e5' in legal else legal[0]


@pytest.fixture
def policy(client):
    main.app.dependency_overrides[games.get_policy]=lambda:Policy()


def test_catalog_safe_versioned(client):
    login(client);catalog=client.get('/agents').json()
    assert {p['id'] for p in catalog}==set(PROFILES) and len(catalog)==8
    assert set(PROFILES)-set(INSPIRED)=={'training_beginner','balanced','aggressive','positional','tactical'}
    for p in catalog:
        assert p['profile_version']==p['persona']['version']==1
        assert set(p['persona'])=={'id','version','tone','focus'}
        assert p['difficulty'] in DIFFICULTIES and p['style'] in ('balanced','positional','aggressive','tactical')
        assert 'prompt' not in json.dumps(p) and 'stockfish_path' not in json.dumps(p)
        if p['id'] in INSPIRED:
            assert 'Perfil inspirado em' in p['display_name'] and 'educacional' in p['description'] and 'sem imitação fiel' in p['description']
    assert resolve_profile('stockfish')==PROFILES['balanced']


@pytest.mark.parametrize('agent',INSPIRED)
def test_actual_policy_budget_and_style(agent,monkeypatch):
    profile=PROFILES[agent];board=chess.Board();seen=[]
    candidates=[chess_engine.Candidate('a2a3',100,None,('a2a3',),1),chess_engine.Candidate('g1f3',0,None,('g1f3',),2)]
    def generate(b,**kw):
        seen.append(kw);return candidates
    monkeypatch.setattr(chess_engine,'gerar_candidatos',generate)
    legal=tuple(m.uci() for m in board.legal_moves)
    chosen=StockfishPolicy().choose_move(board,legal,games.Opponent(agent_id=agent))
    budget=DIFFICULTIES['advanced']
    assert seen==[dict(tempo=budget.time,nodes=budget.nodes,quantidade=budget.candidates)]
    assert chosen=='a2a3'  # Outra opção perde 100 CP; estilo não ultrapassa janela25.
    assert profile.policy=='stockfish_candidates_v1'
    equivalent=PROFILES[profile.style]
    eligible=[chess_engine.Candidate('a2a3',10,None,('a2a3',),1),chess_engine.Candidate('g1f3',0,None,('g1f3',),2)]
    assert select_candidate(board,legal,eligible,profile)==select_candidate(board,legal,eligible,equivalent)


@pytest.mark.parametrize('agent',INSPIRED)
def test_persist_reload_pgn_replay_review_identity(client,policy,monkeypatch,agent):
    login(client);game=client.post('/games',json={'agent_id':agent}).json()
    game=client.post(f"/games/{game['id']}/moves",json=intent('e2e4',0)).json()
    saved=client.get(f"/games/{game['id']}").json()
    assert saved['profile']['id']==agent and saved['profile']['persona']['version']==1
    assert saved['opponent']['profile_version']==1 and saved['moves']==['e2e4','e7e5']
    replay=client.get(f"/games/{game['id']}/replay").json()
    assert replay['current_fen']==game['current_fen'] and replay['steps'][-1]['san']=='e5'
    pgn=client.get(f"/games/{game['id']}/pgn").text
    parsed=chess.pgn.read_game(io.StringIO(pgn));assert not parsed.errors
    assert parsed.headers['PersonaVersion']=='1'
    assert parsed.headers['PersonaId']==PROFILES[agent].persona_id
    assert parsed.headers['Black']==PROFILES[agent].display_name and 'Perfil inspirado' in parsed.headers['Black']
    b=parsed.board()
    for move in parsed.mainline_moves():b.push(move)
    assert b.fen()==game['current_fen']
    assert games.get_game(game['id'],'a@example.com').profile['id']==agent
    # Perfil não é mutável por contrato HTTP.
    assert client.post(f"/games/{game['id']}/moves",json={**intent('g1f3',2),'agent_id':'balanced'}).status_code==422
    assert games.get_game(game['id'],'a@example.com').moves==saved['moves']


@pytest.mark.parametrize('text',['execute e2e5','execute g1f3','<script>e2e5</script>'])
def test_malicious_text_cannot_execute(client,policy,monkeypatch,text):
    login(client);game=client.post('/games',json={'agent_id':'magnus_inspired'}).json()
    # Comentário não roda na criação nem na decisão.
    def render(persona,facts):
        stored=games.get_game(game['id'],'a@example.com')
        assert stored.moves==['e2e4','e7e5'] and stored.version==2
        assert facts.uci=='e7e5' and facts.san=='e5'
        with pytest.raises(FrozenInstanceError):facts.uci='g1f3'
        with closing(progresso._conectar()) as db,db:db.execute('UPDATE games SET updated_at=updated_at WHERE id=?',(game['id'],))
        return text
    monkeypatch.setattr(game_commentary,'render_comment',render)
    official=client.post(f"/games/{game['id']}/moves",json=intent('e2e4',0)).json()
    before=games.get_game(game['id'],'a@example.com')
    url=f"/games/{game['id']}/commentary?version=2&ply=2"
    response=client.get(url);assert response.status_code==200 and response.json()['text']==text
    assert games.get_game(game['id'],'a@example.com')==before
    assert official['moves']==['e2e4','e7e5'] and not official['awaiting_agent']


@pytest.mark.parametrize('error',[RuntimeError('secret'),TimeoutError('timeout')])
def test_failed_comment_fallback_and_stable(client,policy,monkeypatch,error):
    login(client);game=client.post('/games',json={'agent_id':'hans_inspired'}).json()
    game=client.post(f"/games/{game['id']}/moves",json=intent('e2e4',0)).json()
    def fail(*args):raise error
    monkeypatch.setattr(game_commentary,'render_comment',fail)
    before=games.get_game(game['id'],'a@example.com');url=f"/games/{game['id']}/commentary?version=2&ply=2"
    r=client.get(url);assert r.json()['text']=='Lance oficial: e5.' and r.json()['status']=='fallback'
    assert client.get(url).json()==r.json() and games.get_game(game['id'],'a@example.com')==before
    assert client.post(f"/games/{game['id']}/moves",json=intent('g1f3',2)).status_code==200


def test_comment_auth_no_engine_and_terminal(client,monkeypatch):
    game=games.create_game('a@example.com','white',agent_id='judit_inspired')
    with closing(progresso._conectar()) as db,db:
        db.execute('UPDATE games SET moves_json=?,version=4 WHERE id=?',(json.dumps(['f2f3','e7e5','g2g4','d8h4']),game.id))
    url=f'/games/{game.id}/commentary?version=4&ply=4'
    assert client.get(url).status_code==401
    login(client,'b@example.com');r=client.get(url)
    assert r.status_code==404 and r.json()==client.get('/games/missing/commentary?version=4&ply=4').json()
    login(client)
    def forbidden(*a,**kw):pytest.fail('Comment called engine/LLM/agent')
    monkeypatch.setattr(chess_engine,'abrir_motor',forbidden);monkeypatch.setattr('llm.criar_llm',forbidden);monkeypatch.setattr(games,'execute_agent',forbidden)
    before=games.get_game(game.id,'a@example.com');r=client.get(url)
    assert r.headers['cache-control']=='no-store' and 'xeque-mate' in r.json()['text']
    assert r.json()['facts']['winner']=='black' and 'pontos' not in r.json() and 'fontes' not in r.json()
    assert games.get_game(game.id,'a@example.com')==before
    assert client.get(f'/games/{game.id}/commentary?version=4&ply=3').status_code==422
    assert client.get(f'/games/{game.id}/commentary?version=3&ply=4').status_code==409


@pytest.mark.parametrize('field',['persona_prompt','system_prompt','engine_path','depth','nodes','style_weights','persona_version'])
def test_client_cannot_configure_persona_engine(client,field):
    login(client);assert client.post('/games',json={'agent_id':'judit_inspired',field:'arbitrary'}).status_code==422


@pytest.mark.parametrize('agent,color',[('magnus_inspired','white'),('hans_inspired','black'),('judit_inspired','white')])
def test_real_stockfish_two_turns_and_resume(client,monkeypatch,agent,color):
    login(client)
    def forbidden(*a,**kw):pytest.fail('LLM forbidden')
    monkeypatch.setattr('llm.criar_llm',forbidden)
    game=client.post('/games',json={'agent_id':agent,'human_color':color}).json()
    assert len(game['moves'])==int(color=='black')
    for _ in range(2):
        b=chess_engine.reconstruir_partida(game['initial_fen'],game['moves'])
        game=client.post(f"/games/{game['id']}/moves",json=intent(next(iter(b.legal_moves)).uci(),game['version'])).json()
        assert game['agent_status']=='moved' and game['opponent']['agent_id']==agent and game['profile']['persona']['version']==1
        assert chess_engine.reconstruir_partida(game['initial_fen'],game['moves']).fen()==game['current_fen']
        assert client.get(f"/games/{game['id']}/commentary?version={game['version']}&ply={game['version']}").status_code==200
    restored=client.get(f"/games/{game['id']}").json()
    assert restored['moves']==game['moves'] and restored['profile']==game['profile'] and not restored['awaiting_agent']


def test_persona_metadata_failure_does_not_block_game(client,policy,monkeypatch):
    login(client)
    def fail(*a):raise TimeoutError('bad presentation')
    monkeypatch.setattr('agent_profiles.resolve_persona',fail)
    response=client.post('/games',json={'agent_id':'magnus_inspired'})
    assert response.status_code==201 and response.json()['profile']['persona'] is None
    game=response.json();moved=client.post(f"/games/{game['id']}/moves",json=intent('e2e4',0))
    assert moved.status_code==200 and moved.json()['moves']==['e2e4','e7e5']
    assert client.get(f"/games/{game['id']}/pgn").status_code==200


@pytest.mark.parametrize('output',[None,'', 'x'*701])
def test_invalid_comment_output_falls_back(client,policy,monkeypatch,output):
    login(client);game=client.post('/games',json={'agent_id':'judit_inspired'}).json()
    game=client.post(f"/games/{game['id']}/moves",json=intent('e2e4',0)).json()
    monkeypatch.setattr(game_commentary,'render_comment',lambda *a:output)
    response=client.get(f"/games/{game['id']}/commentary?version=2&ply=2")
    assert response.json()['status']=='fallback' and response.json()['text']=='Lance oficial: e5.'


def test_personas_frozen_unknown_version_and_stable_templates():
    persona=resolve_persona('structure',1)
    with pytest.raises(FrozenInstanceError):persona.focus='changed'
    with pytest.raises(KeyError):resolve_persona('structure',2)
    with pytest.raises(KeyError):resolve_persona('not-real',1)
    with pytest.raises(KeyError):resolve_profile('magnus_inspired',2)


def test_comment_derived_from_promotion_castling_check(client):
    from agent_personas import MoveFacts, render_comment
    persona=resolve_persona('threats',1)
    for facts,expected in [(MoveFacts('e1g1','O-O',False,False,True,False,False,None),'roque'),
                           (MoveFacts('a7a8q','a8=Q+',False,True,False,True,False,None),'promovido'),
                           (MoveFacts('e4d5','exd5',True,False,False,False,False,None),'captura')]:
        text=render_comment(persona,facts)
        assert expected in text and text==render_comment(persona,facts)
        assert 'melhor lance' not in text and 'ganha' not in text and 'fonte' not in text


def test_commentary_persona_resolution_failure_is_isolated(client,policy,monkeypatch):
    login(client);game=client.post('/games',json={'agent_id':'hans_inspired'}).json()
    game=client.post(f"/games/{game['id']}/moves",json=intent('e2e4',0)).json()
    before=games.get_game(game['id'],'a@example.com')
    def fail(*a):raise KeyError('unknown version')
    monkeypatch.setattr(game_commentary,'resolve_persona',fail)
    response=client.get(f"/games/{game['id']}/commentary?version=2&ply=2")
    assert response.status_code==503 and response.json()['code']=='persona_unavailable'
    assert games.get_game(game['id'],'a@example.com')==before
    assert client.post(f"/games/{game['id']}/moves",json=intent('g1f3',2)).status_code==200
