"""Continuidade, listagem privada e idempotência de criação em SQLite temporário."""
import json
import uuid
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import chess
import pytest
import games
import main
import progresso
from tests.test_authorization import client, login
from tests.test_games import intent


class First:
    def choose_move(self,board,legal,config): return legal[0]


@pytest.fixture
def policy(client):
    main.app.dependency_overrides[games.get_policy] = lambda: First()


def test_list_auth(client):
    assert client.get('/games').status_code == 401


def test_list_owner_order_profile_and_pagination(client,policy):
    login(client)
    own = [games.create_game('a@example.com','white',agent_id=p) for p in ['stockfish','positional','aggressive']]
    games.create_game('b@example.com','black')
    with closing(progresso._conectar()) as db,db:
        for index,game in enumerate(own): db.execute('UPDATE games SET updated_at=? WHERE id=?',(f'2026-10-05T12:00:0{index}+00:00',game.id))
    response = client.get('/games?limit=2')
    data = response.json()
    assert response.headers['cache-control'] == 'no-store'
    assert [g['id'] for g in data['games']] == [own[2].id,own[1].id]
    assert data['next_offset'] == 2
    assert all('owner' not in g and 'moves' not in g and 'current_fen' not in g for g in data['games'])
    assert data['games'][0]['profile']['style'] == 'aggressive'
    assert data['games'][0]['opponent']['profile_version'] == 1
    last = client.get('/games?limit=2&offset=2').json()
    assert last['next_offset'] is None and last['games'][0]['profile']['id'] == 'balanced'
    assert last['games'][0]['opponent']['agent_id'] == 'stockfish'
    client.post('/auth/logout');login(client,'b@example.com')
    assert len(client.get('/games').json()['games']) == 1
    for path,body in [(f'/games/{own[0].id}',None),(f'/games/{own[0].id}/moves',intent()),(f'/games/{own[0].id}/agent-move',{'version':0})]:
        response = client.get(path) if body is None else client.post(path,json=body)
        assert response.status_code == 404 and response.json()['code'] == 'game_not_found'


def test_active_terminal_filters_and_resume(client,policy):
    login(client)
    active = games.create_game('a@example.com','white',agent_id='positional')
    terminal = games.create_game('a@example.com','black',initial_fen='7k/6Q1/6K1/8/8/8/8/8 b - - 0 1')
    assert [g['id'] for g in client.get('/games?status=active').json()['games']] == [active.id]
    result = client.get('/games?status=finished').json()['games'][0]
    assert result['id'] == terminal.id and result['terminal'] and result['winner'] == 'white'
    loaded = client.get('/games/'+terminal.id).json()
    assert loaded['current_fen'] == terminal.current_fen and not loaded['awaiting_agent']
    assert client.post('/games/'+terminal.id+'/agent-move',json={'version':0}).json()['code'] == 'game_finished'
    assert client.post('/games/'+terminal.id+'/moves',json=intent()).json()['code'] == 'game_finished'


@pytest.mark.parametrize('query',['status=garbage','limit=0','limit=51','offset=-1','offset=10001','limit=abc','offset=1.2'])
def test_invalid_filters(client,query):
    login(client); assert client.get('/games?'+query).status_code == 422


def test_owner_query_cannot_override_session(client):
    login(client); games.create_game('b@example.com','white')
    assert client.get('/games?owner=b@example.com').json()['games'] == []


def test_resume_pending_retry_consistent(client):
    class Fail:
        def choose_move(self,*args): raise TimeoutError()
    main.app.dependency_overrides[games.get_policy] = lambda: Fail()
    login(client); game = client.post('/games',json={'agent_id':'aggressive'}).json()
    first = client.post('/games/'+game['id']+'/moves',json=intent()).json()
    assert first['moves'] == ['e2e4'] and first['awaiting_agent']
    assert client.get('/games').json()['games'][0]['awaiting_agent']
    current = client.get('/games/'+game['id']).json()
    assert current['moves'] == first['moves'] and current['current_fen'] == first['current_fen']
    main.app.dependency_overrides[games.get_policy] = lambda: First()
    result = client.post('/games/'+game['id']+'/agent-move',json={'version':1}).json()
    assert len(result['moves']) == 2 and result['opponent'] == first['opponent']
    assert chess.Board(result['current_fen']).turn == chess.WHITE


def test_create_idempotent_current_state_and_conflict(client,policy):
    login(client); key = str(uuid.uuid4()); payload = {'agent_id':'positional','client_game_id':key}
    first = client.post('/games',json=payload).json()
    games.criar_tabelas(); games.criar_tabelas()
    second = client.post('/games',json=payload).json()
    assert second['id'] == first['id']
    moved = client.post('/games/'+first['id']+'/moves',json=intent()).json()
    retried = client.post('/games',json=payload).json()
    assert retried['moves'] == moved['moves'] and retried['version'] == 2
    for patch in [{'agent_id':'aggressive'},{'human_color':'black'}]:
        r = client.post('/games',json={**payload,**patch});assert r.status_code == 409 and r.json()['code'] == 'duplicate_request_conflict'
    assert len(client.get('/games').json()['games']) == 1
    client.post('/auth/logout');login(client,'b@example.com')
    assert client.post('/games',json=payload).json()['id'] != first['id']


def test_create_without_key_compatible(client,policy):
    login(client)
    assert client.post('/games',json={}).json()['id'] != client.post('/games',json={}).json()['id']


def test_concurrent_create(client):
    barrier = Barrier(2); key = uuid.uuid4()
    def create(_):
        barrier.wait(timeout=3)
        return games.create_or_reuse('a@example.com','black',client_game_id=key,agent_id='aggressive')
    with ThreadPoolExecutor(2) as pool: results = list(pool.map(create,range(2)))
    assert results[0][0].id == results[1][0].id
    assert sum(created for _,created in results) == 1
    assert len(games.list_games('a@example.com','all',20,0).games) == 1


def test_creation_retry_does_not_repeat_agent(client):
    class Counter(First):
        count = 0
        def choose_move(self,*args): self.count += 1;return super().choose_move(*args)
    counter = Counter();main.app.dependency_overrides[games.get_policy] = lambda: counter
    login(client);body={'human_color':'black','client_game_id':str(uuid.uuid4())}
    a=client.post('/games',json=body).json(); b=client.post('/games',json=body).json()
    assert a['id'] == b['id'] and a['moves'] == b['moves'] and counter.count == 1


@pytest.mark.parametrize('color',['white','black'])
def test_real_reconnect_two_turns(client,color):
    from fastapi.testclient import TestClient
    login(client);game = client.post('/games',json={'human_color':color,'agent_id':'balanced'}).json()
    for _ in range(2):
        board=chess.Board(game['current_fen'])
        game=client.post('/games/'+game['id']+'/moves',json=intent(next(iter(board.legal_moves)).uci(),game['version'])).json()
    with TestClient(main.app) as fresh:
        login(fresh)
        listed = fresh.get('/games').json()['games'][0]
        assert listed['id']==game['id'] and listed['opponent']==game['opponent']
        resumed=fresh.get('/games/'+game['id']).json()
        assert resumed['moves']==game['moves'] and resumed['current_fen']==game['current_fen']
        board=chess.Board(resumed['current_fen'])
        continued=fresh.post('/games/'+game['id']+'/moves',json=intent(next(iter(board.legal_moves)).uci(),resumed['version'])).json()
        assert continued['version']==game['version']+2 and continued['side_to_move']==color
        assert continued['opponent']==game['opponent']


def test_default_limit_and_readonly_without_language(client,monkeypatch):
    login(client)
    for _ in range(22): games.create_game('a@example.com','white')
    def forbidden(*args,**kwargs): pytest.fail('Read must not calculate agent or language')
    monkeypatch.setattr('llm.criar_llm',forbidden)
    monkeypatch.setattr('retrieval.buscar',forbidden)
    monkeypatch.setattr('chess_engine.gerar_candidatos',forbidden)
    data=client.get('/games').json()
    assert len(data['games']) == 20 and data['next_offset'] == 20
    assert len(client.get('/games?offset=20').json()['games']) == 2
    assert len(client.get('/games?limit=50').json()['games']) == 22
    resumed=client.get('/games/'+data['games'][0]['id']).json()
    assert resumed['moves'] == [] and resumed['profile']['id'] == 'balanced'


def test_invalid_creation_key_does_not_insert(client):
    login(client)
    response=client.post('/games',json={'client_game_id':'bad'})
    assert response.status_code == 422 and client.get('/games').json()['games'] == []
