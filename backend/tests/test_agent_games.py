"""Turnos completos com bancos temporários, policies controladas e UCI real."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from threading import Barrier
import json
import uuid
import chess
import pytest
import games
import main
import progresso
import chess_engine
from agent_policy import StockfishPolicy
from tests.test_authorization import client, login


class FirstLegal:
    def choose_move(self, board, legal_moves, config):
        return legal_moves[0]


class Fixed:
    def __init__(self, move): self.move = move
    def choose_move(self, *args): return self.move


@pytest.fixture
def policy(client):
    chosen = FirstLegal()
    main.app.dependency_overrides[games.get_policy] = lambda: chosen
    yield chosen
    main.app.dependency_overrides.pop(games.get_policy, None)


def intent(move, version):
    return dict(move=move, version=version, client_move_id=str(uuid.uuid4()))


def seed(fen, color='white', moves=None):
    game = games.create_game('a@example.com', color, initial_fen=fen)
    if moves:
        with closing(progresso._conectar()) as db, db:
            db.execute('UPDATE games SET moves_json=?, version=? WHERE id=?', (json.dumps(moves), len(moves), game.id))
    return games.get_game(game.id, 'a@example.com')


@pytest.mark.parametrize('color', ['white', 'black'])
def test_multiple_turns(client, policy, color, monkeypatch):
    monkeypatch.setattr('llm.criar_llm', lambda *a, **kw: pytest.fail('LLM forbidden'))
    monkeypatch.setattr('retrieval.buscar', lambda *a, **kw: pytest.fail('RAG forbidden'))
    login(client)
    game = client.post('/games', json={'human_color': color}).json()
    assert len(game['moves']) == (color == 'black')
    for _ in range(4):
        board = chess_engine.reconstruir_partida(game['initial_fen'], game['moves'])
        human = next(iter(board.legal_moves)).uci()
        response = client.post('/games/'+game['id']+'/moves', json=intent(human, game['version']))
        assert response.status_code == 200
        new = response.json()
        assert new['moves'][:len(game['moves'])] == game['moves']
        assert new['human_move'] == human and new['agent_move']
        assert new['agent_status'] == 'moved' and not new['awaiting_agent']
        assert new['side_to_move'] == color
        assert chess_engine.reconstruir_partida(new['initial_fen'], new['moves']).fen() == new['current_fen']
        game = new


@pytest.mark.parametrize('failure,code', [(RuntimeError('private path'), 'agent_unavailable'),
                                        (games.GameError('private path', 'secret', 503), 'agent_unavailable'),
                                        (TimeoutError('secret'), 'agent_timeout'),
                                        ('e2e5', 'invalid_agent_move'), ('xxxx', 'invalid_agent_move'),
                                        ('0000', 'invalid_agent_move')])
def test_preserved_retry(client, policy, failure, code):
    class Bad:
        def choose_move(self, board, legal, config):
            board.clear()  # Malicious mutation only affects the policy copy.
            if isinstance(failure, Exception): raise failure
            return failure
    main.app.dependency_overrides[games.get_policy] = lambda: Bad()
    login(client); game = client.post('/games', json={}).json()
    payload = intent('e2e4', 0)
    url = '/games/'+game['id']
    response = client.post(url+'/moves', json=payload)
    assert response.status_code == 200
    pending = response.json()
    assert pending['moves'] == ['e2e4'] and pending['awaiting_agent']
    assert pending['human_move'] == 'e2e4' and pending['error'] == code
    assert 'secret' not in response.text and 'private' not in response.text
    # Human retry acknowledges original intent, never triggers another policy turn.
    main.app.dependency_overrides[games.get_policy] = lambda: FirstLegal()
    assert client.post(url+'/moves', json=payload).json() == pending
    recovered = client.post(url+'/agent-move', json={'version': 1}).json()
    assert recovered['agent_status'] == 'moved' and len(recovered['moves']) == 2
    assert client.post(url+'/agent-move', json={'version': 1}).status_code == 409
    assert client.post(url+'/moves', json=payload).json() == pending


@pytest.mark.parametrize('color', ['white', 'black'])
def test_idempotent_complete(client, policy, color):
    login(client); game = client.post('/games', json={'human_color': color}).json()
    board = chess_engine.reconstruir_partida(game['initial_fen'], game['moves'])
    payload = intent(next(iter(board.legal_moves)).uci(), game['version'])
    url = '/games/'+game['id']+'/moves'
    result = client.post(url, json=payload).json()
    for _ in range(3): assert client.post(url, json=payload).json() == result
    assert len(games.get_game(game['id'], 'a@example.com').moves) == len(game['moves'])+2


def test_concurrent_agent_without_sqlite_lock(client):
    snapshot = games.create_game('a@example.com', 'black')
    barrier = Barrier(2)
    class Concurrent:
        def choose_move(self, board, legal, config):
            # Independent write while the engine thinks proves no SQLite write lock.
            with closing(progresso._conectar()) as db, db:
                db.execute('UPDATE games SET updated_at=updated_at WHERE id=?', (snapshot.id,))
            barrier.wait(timeout=3)
            return 'e2e4'
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: games.execute_agent(snapshot, 'a@example.com', Concurrent()), range(2)))
    assert all(r.agent_status == 'moved' for r in results)
    assert games.get_game(snapshot.id, 'a@example.com').moves == ['e2e4']


def test_stale_candidate(client):
    snapshot = games.create_game('a@example.com', 'black')
    class Stale:
        def choose_move(self, *args):
            games.execute_agent(snapshot, 'a@example.com', Fixed('d2d4'))
            return 'e2e4'
    result = games.execute_agent(snapshot, 'a@example.com', Stale())
    assert result.agent_status == 'moved' and result.moves == ['d2d4']


@pytest.mark.parametrize('fen,move,status', [
    ('7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 'g6g7', 'checkmate'),
    (chess.STARTING_FEN, 'e2e4', 'playing'),
    ('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8', 'check')])
def test_agent_status(client, fen, move, status):
    game = seed(fen, 'black')
    result = games.execute_agent(game, 'a@example.com', Fixed(move))
    assert result.status == status and result.moves == [move]
    if result.terminal:
        with pytest.raises(games.GameError) as error:
            games.execute_agent(result, 'a@example.com', FirstLegal())
        assert error.value.code == 'game_finished'


@pytest.mark.parametrize('piece', ['q', 'r', 'b', 'n'])
def test_agent_promotion(client, piece):
    game = seed('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'black')
    result = games.execute_agent(game, 'a@example.com', Fixed('a7a8'+piece))
    assert result.agent_move == 'a7a8'+piece
    assert chess.Board(result.current_fen).piece_at(chess.A8).symbol() == piece.upper()


@pytest.mark.parametrize('piece', ['q', 'r', 'b', 'n'])
def test_human_promotion(client, policy, piece):
    login(client); game = seed('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    result = client.post('/games/'+game.id+'/moves', json=intent('a7a8'+piece, 0)).json()
    assert result['moves'][0] == 'a7a8'+piece
    assert chess_engine.reconstruir_partida(game.initial_fen, result['moves']).fen() == result['current_fen']


@pytest.mark.parametrize('fen', ['7k/6Q1/5K2/8/8/8/8/8 b - - 0 1',
                                '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
                                '4k3/8/8/8/8/8/8/R3K3 w - - 100 1'])
def test_no_terminal_agent(client, fen):
    game = seed(fen, 'black')
    with pytest.raises(games.GameError) as error: games.execute_agent(game, 'a@example.com', FirstLegal())
    assert error.value.code == 'game_finished'


def test_repetition_by_agent(client):
    moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']
    game = seed(chess.STARTING_FEN, 'white', moves)
    result = games.execute_agent(game, 'a@example.com', Fixed('f6g8'))
    assert result.terminal and result.status == 'repetition'


def test_resume_auth_owner_turn_schema(client, policy):
    assert client.post('/games/x/agent-move', json={'version': 0}).status_code == 401
    login(client); game = client.post('/games', json={}).json(); url = '/games/'+game['id']+'/agent-move'
    assert client.post(url, json={'version': 0}).json()['code'] == 'agent_not_expected'
    assert client.post(url, json={'version': 0, 'move': 'e2e4'}).status_code == 422
    client.post('/auth/logout'); login(client, 'b@example.com')
    assert client.post(url, json={'version': 0}).status_code == 404


@pytest.mark.parametrize('color', ['white', 'black'])
def test_real_stockfish_functional(client, monkeypatch, color):
    monkeypatch.setattr('llm.criar_llm', lambda *a, **kw: pytest.fail('LLM forbidden'))
    monkeypatch.setattr('retrieval.buscar', lambda *a, **kw: pytest.fail('RAG forbidden'))
    from config import settings
    monkeypatch.setattr(settings, 'stockfish_tempo', 0.02)
    processes = []
    original = chess_engine.abrir_motor
    def opening():
        engine = original(); processes.append(engine); return engine
    monkeypatch.setattr(chess_engine, 'abrir_motor', opening)
    login(client); response = client.post('/games', json={'human_color': color}); assert response.status_code == 201
    game = response.json()
    for _ in range(2):
        board = chess_engine.reconstruir_partida(game['initial_fen'], game['moves'])
        payload = intent(next(iter(board.legal_moves)).uci(), game['version'])
        response = client.post('/games/'+game['id']+'/moves', json=payload)
        assert response.status_code == 200
        game = response.json()
        assert game['agent_status'] == 'moved' and game['side_to_move'] == color
        assert chess_engine.reconstruir_partida(game['initial_fen'], game['moves']).fen() == game['current_fen']
    assert len(processes) == 2 + (color == 'black')
    for engine in processes: assert engine.returncode.result(timeout=2) == 0


@pytest.mark.parametrize('failure', [TimeoutError(), RuntimeError()])
def test_engine_closed_on_failure(monkeypatch, failure):
    class Engine:
        def play(self, *args): raise failure
        def quit(self): self.quit_called = True
        def close(self): self.close_called = True
    engine = Engine()
    monkeypatch.setattr(chess_engine, 'abrir_motor', lambda: engine)
    with pytest.raises(type(failure)): StockfishPolicy().choose_move(chess.Board(), ('e2e4',), games.Opponent())
    assert engine.quit_called and engine.close_called


def test_concurrent_human_requests(client):
    game = games.create_game('a@example.com', 'white')
    barrier = Barrier(2)
    def request(move):
        barrier.wait(timeout=3)
        try:
            result = games.submit_human_move(game.id, 'a@example.com', games.HumanMove(**intent(move, 0)))
            return games.execute_agent(result, 'a@example.com', FirstLegal())
        except games.GameError as error:
            return error.code
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(request, ['e2e4', 'd2d4']))
    assert sum(isinstance(r, games.Game) for r in results) == 1
    assert 'stale_game_version' in results
    current = games.get_game(game.id, 'a@example.com')
    assert len(current.moves) == 2 and current.version == 2
    assert chess_engine.reconstruir_partida(current.initial_fen, current.moves).fen() == current.current_fen


def test_agent_expired_session(client, policy):
    import time
    import auth
    login(client)
    with closing(auth.connect()) as db, db:
        db.execute('UPDATE sessions SET expires=?', (time.time()-1,))
    assert client.post('/games/x/agent-move', json={'version': 0}).status_code == 401


@pytest.mark.parametrize('tempo', [0, -1, float('inf'), 11])
def test_decision_budget(tempo):
    with pytest.raises(ValueError): chess_engine.escolher_lance(chess.Board(), tempo)


def test_concurrent_same_human_key(client, policy):
    login(client); game = client.post('/games', json={}).json()
    barrier = Barrier(2)
    class Concurrent:
        def choose_move(self, board, legal, config):
            barrier.wait(timeout=3)
            return 'e7e5'
    main.app.dependency_overrides[games.get_policy] = lambda: Concurrent()
    payload = intent('e2e4', 0)
    def request(_):
        return client.post('/games/'+game['id']+'/moves', json=payload)
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(request, range(2)))
    assert all(r.status_code == 200 for r in responses)
    assert responses[0].json() == responses[1].json()
    assert games.get_game(game['id'], 'a@example.com').moves == ['e2e4', 'e7e5']


@pytest.mark.parametrize('exception', [chess_engine.StockfishAusente('private path'), TimeoutError('private process')])
def test_stockfish_failure_after_commit(client, monkeypatch, exception):
    def fail(): raise exception
    monkeypatch.setattr(chess_engine, 'abrir_motor', fail)
    login(client); game = client.post('/games', json={}).json()
    result = client.post('/games/'+game['id']+'/moves', json=intent('e2e4', 0))
    assert result.status_code == 200
    assert result.json()['human_move'] == 'e2e4' and result.json()['awaiting_agent']
    assert result.json()['error'] in ('agent_unavailable', 'agent_timeout')
    assert games.get_game(game['id'], 'a@example.com').moves == ['e2e4']
    assert 'private' not in result.text


@pytest.mark.parametrize('fen,move,status', [
    ('7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 'g6g7', 'checkmate'),
    ('4k3/8/8/8/8/8/8/R3K3 w - - 99 1', 'a1a2', 'fifty_move')])
def test_human_terminal_does_not_execute(client, policy, fen, move, status):
    class Forbidden:
        def choose_move(self, *args): pytest.fail('terminal policy called')
    main.app.dependency_overrides[games.get_policy] = lambda: Forbidden()
    login(client); game = seed(fen)
    result = client.post('/games/'+game.id+'/moves', json=intent(move, 0)).json()
    assert result['terminal'] and result['status'] == status
    assert result['agent_move'] is None and result['agent_status'] == 'not_requested'


def test_complete_game_from_creation_to_mate(client, policy):
    class FoolMate:
        def choose_move(self, board, legal, config):
            return 'e7e5' if len(board.move_stack) == 1 else 'd8h4'
    main.app.dependency_overrides[games.get_policy] = lambda: FoolMate()
    login(client); game = client.post('/games', json={}).json()
    for human in ['f2f3', 'g2g4']:
        response = client.post('/games/'+game['id']+'/moves', json=intent(human, game['version']))
        assert response.status_code == 200; game = response.json()
    assert game['moves'] == ['f2f3', 'e7e5', 'g2g4', 'd8h4']
    assert game['terminal'] and game['status'] == 'checkmate' and game['winner'] == 'black'
    assert client.post('/games/'+game['id']+'/moves', json=intent('e2e4', game['version'])).json()['code'] == 'game_finished'


def test_engine_policy_preserves_history(monkeypatch):
    moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']
    board = chess_engine.reconstruir_partida(chess.STARTING_FEN, moves)
    class Engine:
        def play(self, snapshot, limit):
            assert snapshot is not board
            assert [m.uci() for m in snapshot.move_stack] == moves
            class Result: move = chess.Move.from_uci('f6g8')
            return Result()
        def quit(self): pass
        def close(self): pass
    monkeypatch.setattr(chess_engine, 'abrir_motor', lambda: Engine())
    assert StockfishPolicy().choose_move(board, tuple(m.uci() for m in board.legal_moves), games.Opponent()) == 'f6g8'
    assert [m.uci() for m in board.move_stack] == moves
