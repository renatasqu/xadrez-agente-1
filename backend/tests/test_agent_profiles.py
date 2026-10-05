"""Perfis v1, seleção controlada e poucos testes reais MultiPV."""
from contextlib import closing
import chess
import chess.engine
import pytest
import games
import main
import progresso
import chess_engine as engine
from agent_profiles import PROFILES, DIFFICULTIES, resolve_profile, AgentProfile
from agent_policy import StockfishPolicy, select_candidate, quality_candidates
from tests.test_authorization import client, login
from tests.test_games import intent


def c(move, cp=0, rank=1, mate=None, pv=None):
    return engine.Candidate(move, cp if mate is None else None, mate, tuple(pv or [move]), rank)


def test_profile_api_auth_and_safe_metadata(client):
    assert client.get('/agents').status_code == 401
    login(client)
    data = client.get('/agents').json()
    assert len(data) == 8
    assert all(set(p) == {'id','display_name','difficulty','style','description','inspiration','profile_version','persona'} for p in data)
    assert {p['difficulty'] for p in data} == set(DIFFICULTIES)
    assert {p['style'] for p in data} == {'balanced','aggressive','positional','tactical'}


@pytest.mark.parametrize('agent', list(PROFILES) + ['stockfish'])
def test_persist_identity_and_reload(client, agent):
    login(client)
    game = client.post('/games', json={'agent_id': agent}).json()
    assert game['opponent']['agent_id'] == agent
    assert client.get('/games/'+game['id']).json()['opponent']['agent_id'] == agent
    with closing(progresso._conectar()) as db:
        assert db.execute('SELECT agent_id FROM games WHERE id=?', (game['id'],)).fetchone()[0] == agent


@pytest.mark.parametrize('body', [{'agent_id':'unknown'}, {'agent_id':'balanced','depth':100000}, {'agent_id':'balanced','executable_path':'/tmp/x'}])
def test_invalid_configuration_before_insert(client, body):
    login(client)
    assert client.post('/games', json=body).status_code == 422
    with closing(progresso._conectar()) as db:
        assert db.execute('SELECT COUNT(*) FROM games').fetchone()[0] == 0


def test_legacy_alias_and_default():
    assert games.CreateGame().agent_id == 'stockfish'
    assert resolve_profile('stockfish') == resolve_profile('balanced')


def test_balanced_and_beginner_controlled_variation():
    board = chess.Board(); candidates = [c('e2e4',100),c('g1f3',0,2)]
    legal = tuple(m.uci() for m in board.legal_moves)
    assert select_candidate(board,legal,candidates,PROFILES['balanced']) == 'e2e4'
    assert select_candidate(board,legal,candidates,PROFILES['training_beginner']) == 'g1f3'
    assert select_candidate(board,legal,[c('e2e4',200),c('g1f3',0,2)],PROFILES['training_beginner']) == 'e2e4'


@pytest.mark.parametrize('style,fen,best,alternative', [
    ('aggressive','4k3/8/8/8/8/8/4P3/R3K3 w Q - 0 1','e2e3','a1a8'),
    ('tactical','4k3/8/8/8/8/8/4P3/R3K3 w Q - 0 1','e2e3','a1a8'),
    ('positional',chess.STARTING_FEN,'a2a3','g1f3')])
def test_style_changes_only_within_window(style,fen,best,alternative):
    board = chess.Board(fen); legal = tuple(m.uci() for m in board.legal_moves)
    profile = PROFILES[style]
    assert select_candidate(board,legal,[c(best,30),c(alternative,20,2)],profile) == alternative
    assert select_candidate(board,legal,[c(best,200),c(alternative,0,2)],profile) == best


def test_windows_strictly_different():
    candidates = [c('e2e4',100),c('g1f3',50,2),c('d2d4',0,3)]
    for difficulty,count in [('advanced',1),('intermediate',2),('beginner',3)]:
        profile = AgentProfile('test','Test',difficulty,'balanced','test')
        assert len(quality_candidates(candidates, profile)) == count
    assert DIFFICULTIES['beginner'].nodes < DIFFICULTIES['intermediate'].nodes < DIFFICULTIES['advanced'].nodes


@pytest.mark.parametrize('profile', list(PROFILES.values()))
def test_mates_separate_from_cp(profile):
    assert quality_candidates([c('e2e4',99999),c('g1f3',mate=3),c('d2d4',mate=1)],profile)[0].move == 'd2d4'
    assert quality_candidates([c('e2e4',-99999),c('g1f3',mate=-1)],profile)[0].move == 'e2e4'
    assert quality_candidates([c('e2e4',mate=-1),c('g1f3',mate=-4)],profile)[0].move == 'g1f3'


def test_illegal_candidates_ignored_and_final_revalidation(client):
    board = chess.Board(); legal = tuple(m.uci() for m in board.legal_moves)
    assert select_candidate(board,legal,[c('e2e5',9999),c('e2e4',0,2)],PROFILES['balanced']) == 'e2e4'
    class Illegal:
        def choose_move(self,*args): return 'e7e4'
    main.app.dependency_overrides[games.get_policy] = lambda: Illegal()
    login(client); game = client.post('/games',json={'agent_id':'aggressive'}).json()
    result = client.post('/games/'+game['id']+'/moves',json=intent()).json()
    assert result['moves'] == ['e2e4'] and result['error'] == 'invalid_agent_move'
    assert result['opponent']['agent_id'] == 'aggressive'


def test_only_legal_move_skips_engine(monkeypatch):
    board = chess.Board('7k/5K2/6R1/8/8/8/8/8 b - - 0 1')
    legal = tuple(m.uci() for m in board.legal_moves)
    assert len(legal) == 1
    monkeypatch.setattr(engine,'gerar_candidatos',lambda *a,**kw: pytest.fail('unnecessary engine'))
    assert StockfishPolicy().choose_move(board,legal,games.Opponent()) == legal[0]


@pytest.mark.parametrize('profile', list(PROFILES.values()))
def test_budget_forwarded_without_language(monkeypatch,profile):
    seen = {}
    def generate(board,**kwargs):
        seen.update(kwargs); return [c('e2e4')]
    monkeypatch.setattr(engine,'gerar_candidatos',generate)
    monkeypatch.setattr('llm.criar_llm',lambda *a,**kw: pytest.fail('LLM'))
    monkeypatch.setattr('retrieval.buscar',lambda *a,**kw: pytest.fail('RAG'))
    board = chess.Board()
    assert StockfishPolicy().choose_move(board,tuple(m.uci() for m in board.legal_moves),games.Opponent(agent_id=profile.id)) == 'e2e4'
    budget = DIFFICULTIES[profile.difficulty]
    assert seen == dict(tempo=budget.time,nodes=budget.nodes,quantidade=budget.candidates)


@pytest.mark.parametrize('name',list(DIFFICULTIES))
def test_real_multipv_budget_and_closure(monkeypatch,name):
    motors = []; original = engine.abrir_motor
    def opening():
        motor = original(); motors.append(motor); return motor
    monkeypatch.setattr(engine,'abrir_motor',opening)
    budget = DIFFICULTIES[name]; board = chess.Board()
    candidates = engine.gerar_candidatos(board,tempo=budget.time,nodes=budget.nodes,quantidade=budget.candidates)
    assert len(candidates) == budget.candidates
    assert len({c.move for c in candidates}) == budget.candidates
    for item in candidates:
        assert chess.Move.from_uci(item.move) in board.legal_moves
        assert item.perspective == 'side_to_move' and (item.cp is not None or item.mate is not None)
        replay = board.copy()
        for move in item.pv:
            step = chess.Move.from_uci(move); assert step in replay.legal_moves; replay.push(step)
    assert all(m.returncode.result(timeout=2) == 0 for m in motors)


@pytest.mark.parametrize('black',[False,True])
def test_real_mate_candidates(black):
    board = chess.Board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
    if black: board = board.mirror()
    candidates = engine.gerar_candidatos(board,tempo=.1,nodes=50000,quantidade=4)
    assert any(c.mate == 1 and c.cp is None for c in candidates)
    move = select_candidate(board,tuple(m.uci() for m in board.legal_moves),candidates,PROFILES['tactical'])
    board.push_uci(move); assert board.is_checkmate()


@pytest.mark.parametrize('agent,color',[('balanced','white'),('aggressive','white'),('positional','black')])
def test_real_functional_profiles(client,agent,color):
    login(client); game = client.post('/games',json={'human_color':color,'agent_id':agent}).json()
    if color == 'black': assert len(game['moves']) == 1
    for _ in range(2):
        board = engine.reconstruir_partida(game['initial_fen'],game['moves'])
        result = client.post('/games/'+game['id']+'/moves',json=intent(next(iter(board.legal_moves)).uci(),game['version']))
        assert result.status_code == 200; game = result.json()
        assert game['agent_status'] == 'moved' and game['side_to_move'] == color
        assert game['opponent']['agent_id'] == agent
        assert engine.reconstruir_partida(game['initial_fen'],game['moves']).fen() == game['current_fen']


def test_profile_retry_after_failure(client):
    class Retry:
        failed = False
        def choose_move(self,board,legal,config):
            assert config.agent_id == 'tactical'
            if not self.failed:
                self.failed = True; raise TimeoutError()
            return legal[0]
    policy = Retry(); main.app.dependency_overrides[games.get_policy] = lambda: policy
    login(client); game = client.post('/games',json={'agent_id':'tactical'}).json()
    first = client.post('/games/'+game['id']+'/moves',json=intent()).json()
    assert first['error'] == 'agent_timeout' and first['moves'] == ['e2e4']
    next_game = client.post('/games/'+game['id']+'/agent-move',json={'version':1}).json()
    assert len(next_game['moves']) == 2 and next_game['opponent']['agent_id'] == 'tactical'


def test_legacy_database_migration_and_acknowledgement(client):
    import json
    login(client)
    game = games.create_game('a@example.com','white')
    games.submit_human_move(game.id,'a@example.com',games.HumanMove(**intent()))
    with closing(progresso._conectar()) as db, db:
        db.execute('ALTER TABLE games DROP COLUMN profile_version')
        data = json.loads(db.execute('SELECT response_json FROM game_move_requests').fetchone()[0])
        data['opponent'].pop('profile_version')
        db.execute('UPDATE game_move_requests SET response_json=?',(json.dumps(data),))
    games.criar_tabelas(); games.criar_tabelas()
    restored = games.get_game(game.id,'a@example.com')
    assert restored.moves == ['e2e4'] and restored.opponent.profile_version == 1
    assert resolve_profile(restored.opponent.agent_id,restored.opponent.profile_version).id == 'balanced'
    with closing(progresso._conectar()) as db:
        assert games.Game.model_validate_json(db.execute('SELECT response_json FROM game_move_requests').fetchone()[0]).opponent.profile_version == 1
    assert client.get('/auth/session').json()['email'] == 'a@example.com'


@pytest.mark.parametrize('kwargs',[dict(tempo=0,nodes=1,quantidade=1),dict(tempo=2,nodes=1,quantidade=1),dict(tempo=.1,nodes=50001,quantidade=1),dict(tempo=.1,nodes=1,quantidade=6)])
def test_candidate_limits_rejected_before_process(monkeypatch,kwargs):
    monkeypatch.setattr(engine,'abrir_motor',lambda: pytest.fail('process opened'))
    with pytest.raises(ValueError): engine.gerar_candidatos(chess.Board(),**kwargs)


def test_multipv_filters_malformed_and_closes(monkeypatch):
    class Motor:
        closed = False
        def analyse(self,board,limit,**kwargs):
            assert kwargs['multipv'] == 3 and limit.nodes == 100
            score = chess.engine.PovScore(chess.engine.Cp(10),chess.BLACK)
            return [
                {'score':score,'pv':[chess.Move.from_uci('e2e5')]},
                {'pv':[chess.Move.from_uci('e2e4')]},
                {'score':score,'pv':[chess.Move.from_uci('e2e4'),chess.Move.from_uci('e2e3')],'multipv':1},
                {'score':score,'pv':[chess.Move.from_uci('e2e4')],'multipv':2}]
        def quit(self): pass
        def close(self): self.closed = True
    motor = Motor(); monkeypatch.setattr(engine,'abrir_motor',lambda: motor)
    result = engine.gerar_candidatos(chess.Board(),tempo=.1,nodes=100,quantidade=3)
    assert len(result) == 1 and result[0].cp == -10 and result[0].pv == ('e2e4',) and motor.closed


def test_busy_slots_fail_without_process(monkeypatch):
    class Full:
        def acquire(self,timeout): assert timeout == 1; return False
    monkeypatch.setattr(engine,'_CANDIDATE_SLOTS',Full())
    monkeypatch.setattr(engine,'abrir_motor',lambda: pytest.fail('process opened'))
    with pytest.raises(TimeoutError): engine.gerar_candidatos(chess.Board(),tempo=.1,nodes=100,quantidade=3)


def test_unknown_profile_version_fails_closed():
    with pytest.raises(KeyError): resolve_profile('balanced',2)


def test_profile_concurrent_resume(client):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    login(client)
    game = games.create_game('a@example.com','white',agent_id='aggressive')
    pending = games.submit_human_move(game.id,'a@example.com',games.HumanMove(**intent()))
    barrier = Barrier(2)
    class Concurrent:
        def choose_move(self,board,legal,config):
            assert config.agent_id == 'aggressive' and config.profile_version == 1
            barrier.wait(timeout=3); return 'e7e5'
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda _: games.execute_agent(pending,'a@example.com',Concurrent()),range(2)))
    assert all(r.moves == ['e2e4','e7e5'] and r.opponent.agent_id == 'aggressive' for r in results)
    assert games.get_game(game.id,'a@example.com').version == 2


def test_process_slot_released_after_open_failure(monkeypatch):
    from threading import BoundedSemaphore
    slots = BoundedSemaphore(1)
    monkeypatch.setattr(engine,'_CANDIDATE_SLOTS',slots)
    def fail(): raise OSError()
    monkeypatch.setattr(engine,'abrir_motor',fail)
    with pytest.raises(OSError): engine.gerar_candidatos(chess.Board(),tempo=.1,nodes=10,quantidade=1)
    assert slots.acquire(blocking=False)
    slots.release()
