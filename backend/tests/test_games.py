"""Integração com sessões reais e bancos temporários; nenhum agente executado."""
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from threading import Barrier
import chess
import pytest
import auth
import games
import progresso
from chess_engine import reconstruir_partida, estado_tabuleiro
from tests.test_authorization import client, login


@pytest.fixture(autouse=True)
def unavailable_policy(client):
    # Exercita o estado persistido humano isoladamente, agora com falha recuperável da IA.
    import main
    class Unavailable:
        def choose_move(self, *args):
            raise RuntimeError('offline simulated')
    main.app.dependency_overrides[games.get_policy] = lambda: Unavailable()
    yield
    main.app.dependency_overrides.pop(games.get_policy, None)


def official(data):
    return {k: v for k, v in data.items() if k not in ('human_move', 'agent_move', 'agent_status', 'error')}


def intent(move='e2e4',version=0,key=None):
    return dict(move=move,version=version,client_move_id=key or str(uuid.uuid4()))


def create(client,color='white'):
    response = client.post('/games',json={'human_color':color})
    assert response.status_code == 201
    return response.json()


def seed(fen=chess.STARTING_FEN,moves=None,color='white'):
    # Apenas configuração local do teste; sem rota de FEN/histórico/reset.
    game = games.create_game('a@example.com',color,initial_fen=fen)
    moves = moves or []
    reconstruir_partida(fen,moves)
    with closing(progresso._conectar()) as db,db:
        db.execute('UPDATE games SET moves_json = ?, version = ? WHERE id = ?', (json.dumps(moves),len(moves),game.id))
    return games.get_game(game.id,'a@example.com')


@pytest.mark.parametrize('method,path,body', [('POST','/games',{}),('GET','/games/x',None),('POST','/games/x/moves',intent())])
def test_auth(client,method,path,body):
    assert client.request(method,path,json=body).status_code == 401


@pytest.mark.parametrize('color',['white','black'])
def test_create_read(client,color):
    login(client); game = create(client,color)
    assert uuid.UUID(game['id']).version == 4
    assert game['initial_fen'] == game['current_fen'] == chess.STARTING_FEN
    assert game['moves'] == [] and game['version'] == 0
    assert game['human_color'] == color and game['side_to_move'] == 'white'
    assert game['awaiting_agent'] == (color == 'black')
    assert game['opponent'] == {'type':'ai','agent_id':'stockfish','profile_version':1}
    assert game['status'] == 'playing' and not game['terminal'] and game['winner'] is None
    assert game['created_at'] == game['updated_at']
    assert 'owner' not in game and 'email' not in game
    response = client.get('/games/'+game['id'])
    assert official(response.json()) == official(game) and response.headers['cache-control'] == 'no-store'
    assert create(client)['id'] != game['id']


@pytest.mark.parametrize('method',['GET','POST'])
def test_other_owner(client,method):
    login(client); game = create(client)
    client.post('/auth/logout'); login(client,'b@example.com')
    path = '/games/'+game['id']+('/moves' if method == 'POST' else '')
    response = client.request(method,path,json=intent() if method == 'POST' else None)
    assert response.status_code == 404 and response.json()['code'] == 'game_not_found'
    assert response.json() == client.get('/games/'+str(uuid.uuid4())).json()
    assert games.get_game(game['id'],'a@example.com').moves == []


def test_legal_persisted_no_llm_engine(client,monkeypatch):
    monkeypatch.setattr('chess_engine.analisar_posicao',lambda *a,**kw: pytest.fail('no engine'))
    monkeypatch.setattr('llm.criar_llm',lambda *a,**kw: pytest.fail('no LLM'))
    login(client); game = create(client); url = '/games/'+game['id']+'/moves'
    response = client.post(url,json=intent())
    assert response.status_code == 200
    result = response.json()
    assert result['moves'] == ['e2e4'] and result['version'] == 1
    assert result['awaiting_agent'] and result['side_to_move'] == 'black'
    assert result['current_fen'] == reconstruir_partida(chess.STARTING_FEN,['e2e4']).fen()
    assert official(games.get_game(game['id'],'a@example.com').model_dump()) == official(result)
    assert result['updated_at'] >= result['created_at']
    rejected = client.post(url,json=intent('e7e5',1))
    assert rejected.status_code == 409 and rejected.json()['code'] == 'not_human_turn'
    assert official(client.get('/games/'+game['id']).json()) == official(result)


@pytest.mark.parametrize('move',['e2e5','e7e5','a1a8','e2e4q','xxxx','0000'])
def test_invalid(client,move):
    login(client); game = create(client)
    response = client.post('/games/'+game['id']+'/moves',json=intent(move))
    assert response.status_code == 422 and response.json()['code'] == 'invalid_move'
    assert official(client.get('/games/'+game['id']).json()) == official(game)


def test_black_waits(client):
    login(client); game = create(client,'black')
    response = client.post('/games/'+game['id']+'/moves',json=intent('e7e5'))
    assert response.status_code == 409 and response.json()['code'] == 'not_human_turn'
    assert games.get_game(game['id'],'a@example.com').moves == []


@pytest.mark.parametrize('piece',['q','r','b','n'])
def test_promotions(client,piece):
    login(client); game = seed('7k/P7/8/8/8/8/8/7K w - - 0 1')
    response = client.post(f'/games/{game.id}/moves',json=intent('a7a8'+piece))
    assert response.status_code == 200
    assert chess.Board(response.json()['current_fen']).piece_at(chess.A8).symbol() == piece.upper()
    assert response.json()['moves'] == ['a7a8'+piece]


@pytest.mark.parametrize('move',['a7a8','a7a8k'])
def test_invalid_promotion(client,move):
    login(client); game = seed('7k/P7/8/8/8/8/8/7K w - - 0 1')
    assert client.post(f'/games/{game.id}/moves',json=intent(move)).status_code == 422
    assert games.get_game(game.id,'a@example.com') == game


@pytest.mark.parametrize('fen,move,status,winner',[
    ('7k/8/8/8/8/8/R7/K7 w - - 0 1','a2h2','check',None),
    ('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1','f7g7','checkmate','white'),
    ('7k/8/8/8/8/8/R7/K7 w - - 99 51','a2a3','fifty_move',None),
    ('7k/P7/8/8/8/8/8/7K w - - 0 1','a7a8n','insufficient_material',None)])
def test_result_status(client,fen,move,status,winner):
    login(client); game = seed(fen)
    response = client.post(f'/games/{game.id}/moves',json=intent(move))
    assert response.status_code == 200
    result = response.json()
    assert result['status'] == status and result['winner'] == winner
    assert result['terminal'] == (status != 'check')
    assert result['awaiting_agent'] == (status == 'check')


def test_repetition_history(client):
    login(client); moves = ['g1f3','g8f6','f3g1','f6g8','g1f3','g8f6','f3g1']
    game = seed(moves=moves,color='black')
    response = client.post(f'/games/{game.id}/moves',json=intent('f6g8',7))
    assert response.status_code == 200 and response.json()['status'] == 'repetition'
    assert response.json()['terminal'] and not response.json()['awaiting_agent']
    result = games.get_game(game.id,'a@example.com')
    assert estado_tabuleiro(reconstruir_partida(result.initial_fen,result.moves))['status'] == 'repetition'


@pytest.mark.parametrize('fen',[
    '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1','7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
    '7k/8/8/8/8/8/8/K7 w - - 0 1','7k/8/8/8/8/8/R7/K7 w - - 100 51'])
def test_terminal(client,fen):
    login(client); game = seed(fen)
    response = client.post(f'/games/{game.id}/moves',json=intent('a1a2'))
    assert response.status_code == 409 and response.json()['code'] == 'game_finished'
    assert games.get_game(game.id,'a@example.com') == game


def test_retry_and_conflict(client):
    login(client); game = create(client); payload = intent(); url = '/games/'+game['id']+'/moves'
    first = client.post(url,json=payload)
    assert first.status_code == 200
    assert client.post(url,json=payload).json() == first.json()
    changed = client.post(url,json={**payload,'move':'d2d4'})
    assert changed.status_code == 409 and changed.json()['code'] == 'duplicate_request'
    assert games.get_game(game['id'],'a@example.com').version == 1


def test_stale(client):
    login(client); game = create(client)
    response = client.post('/games/'+game['id']+'/moves',json=intent(version=1))
    assert response.status_code == 409 and response.json()['code'] == 'stale_game_version'
    assert official(client.get('/games/'+game['id']).json()) == official(game)


@pytest.mark.parametrize('same_key',[True,False])
def test_concurrency(client,same_key):
    login(client); game = create(client); barrier = Barrier(2); key = str(uuid.uuid4())
    def attempt(move):
        barrier.wait()
        try:
            return games.submit_human_move(game['id'],'a@example.com',games.HumanMove(**intent(move,key=key if same_key else None)))
        except games.GameError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt,['e2e4','e2e4' if same_key else 'd2d4']))
    result = games.get_game(game['id'],'a@example.com')
    assert result.version == 1 and len(result.moves) == 1
    if same_key: assert results[0] == results[1]
    else:
        assert sum(isinstance(r,games.Game) for r in results) == 1
        assert 'stale_game_version' in results


@pytest.mark.parametrize('path',['/games','/games/x','/games/x/moves'])
def test_expired(client,path):
    login(client)
    with closing(auth.connect()) as db,db:
        db.execute('UPDATE sessions SET expires = ?', (time.time()-1,))
    response = client.get(path) if path == '/games/x' else client.post(path,json={} if path == '/games' else intent())
    assert response.status_code == 401


@pytest.mark.parametrize('body',[{'human_color':'white','owner':'b@example.com'},
    {'human_color':'white','initial_fen':chess.STARTING_FEN},{'human_color':'red'}])
def test_untrusted_create(client,body):
    login(client)
    assert client.post('/games',json=body).status_code == 422


def test_no_fen_reset(client):
    login(client); game = create(client); url = '/games/'+game['id']
    assert client.post(url+'/moves',json={**intent(),'fen':chess.STARTING_FEN}).status_code == 422
    assert client.post(url+'/reset').status_code == 404
    assert client.delete(url).status_code == 405
    assert client.get(url).json() == game


def test_additive_migration(client):
    login(client); identity = progresso.identidade('a@example.com'); progresso.avancar(identity,1)
    game = create(client); games.criar_tabelas(); games.criar_tabelas()
    assert progresso.proxima_licao(identity) == 2
    assert games.get_game(game['id'],'a@example.com').id == game['id']
    assert client.get('/auth/session').json()['email'] == 'a@example.com'

@pytest.mark.parametrize('patch', [{'version':True},{'version':-1},{'client_move_id':'bad'},{'owner':'b@example.com'}])
def test_move_contract_strict(client,patch):
    login(client); game = create(client)
    response = client.post('/games/'+game['id']+'/moves',json={**intent(),**patch})
    assert response.status_code == 422
    assert games.get_game(game['id'],'a@example.com').version == 0


def test_migration_keeps_cache_attempts_and_sessions(client):
    from schemas import Resposta
    login(client); identity = progresso.identidade('a@example.com')
    progresso.registrar_exercicio(identity,'a1-cavalo','correct')
    cached = Resposta(resposta='Conteúdo preservado',fontes=[],agente='professor',confianca=0)
    progresso.gravar_cache(1,cached)
    games.criar_tabelas()
    assert progresso.ler_cache(1) == cached
    assert progresso.ler_exercicios(identity)[0]['attempts'] == 1
    assert client.get('/auth/session').json()['email'] == 'a@example.com'


def test_storage_error_does_not_leak(client,monkeypatch):
    import sqlite3
    login(client)
    def unavailable():
        raise sqlite3.OperationalError('private path')
    monkeypatch.setattr(progresso,'_conectar',unavailable)
    response = client.post('/games',json={})
    assert response.status_code == 503 and response.json()['code'] == 'storage_unavailable'
    assert 'private' not in response.text
