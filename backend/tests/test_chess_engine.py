"""Serviço puro: contratos, legalidade, perspectiva, recursos e pequeno conjunto UCI real."""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import chess
import chess.engine
import pytest

import chess_engine as engine

INITIAL = chess.STARTING_FEN
BLACK = engine.aplicar_movimento(INITIAL, 'e2e4')
MATE = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'
CHECKMATE = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'


class FakeEngine:
    def __init__(self, info=None, error=None):
        self.info, self.error = info, error
        self.events = []

    def analyse(self, board, limit):
        self.events.append('analyse')
        assert limit.time > 0
        if self.error:
            raise self.error
        return self.info

    def quit(self):
        self.events.append('quit')

    def close(self):
        self.events.append('close')


def fake_info(fen=INITIAL, score=None, pv=None):
    return {'score': score or chess.engine.PovScore(chess.engine.Cp(45), chess.WHITE),
            'pv': pv if pv is not None else [next(iter(chess.Board(fen).legal_moves))], 'depth': 12}


@pytest.mark.parametrize('fen', [INITIAL, BLACK])
@pytest.mark.parametrize('pov,kind,value,expected', [
    (chess.WHITE, 'cp', 125, 125), (chess.BLACK, 'cp', 125, -125),
    (chess.WHITE, 'mate', 3, 3), (chess.BLACK, 'mate', 3, -3),
])
def test_white_perspective_independent_of_turn(fen, pov, kind, value, expected):
    score = chess.engine.PovScore(chess.engine.Cp(value) if kind == 'cp' else chess.engine.Mate(value), pov)
    motor = FakeEngine(fake_info(fen, score))
    result = engine.analisar_posicao(fen, 0.01, abrir=lambda: motor)
    assert result.perspectiva == 'white'
    assert result.lado == ('brancas' if chess.Board(fen).turn else 'pretas')
    assert (result.pontos if kind == 'cp' else result.mate) == expected
    assert (result.mate if kind == 'cp' else result.pontos) is None
    assert result.profundidade == 12
    assert motor.events == ['analyse', 'quit', 'close']


def test_pv_replays_san_and_uci_and_is_limited():
    pv = [chess.Move.from_uci(uci) for uci in ['e2e4', 'e7e5', 'g1f3', 'b8c6']]
    result = engine.analisar_posicao(INITIAL, abrir=lambda: FakeEngine(fake_info(pv=pv)))
    assert result.linha == ['e4', 'e5', 'Nf3']
    assert result.linha_uci == ['e2e4', 'e7e5', 'g1f3']
    assert result.melhor_lance == 'e4' and result.melhor_lance_uci == 'e2e4'
    fen = INITIAL
    for san, uci in zip(result.linha, result.linha_uci, strict=True):
        board = chess.Board(fen)
        assert board.san(engine.movimento_legal(fen, uci)) == san
        fen = engine.aplicar_movimento(fen, uci)


def test_pv_stops_before_illegal_suffix():
    pv = [chess.Move.from_uci(uci) for uci in ['e2e4', 'e2e3', 'g1f3']]
    result = engine.analisar_posicao(INITIAL, abrir=lambda: FakeEngine(fake_info(pv=pv)))
    assert result.linha_uci == ['e2e4'] and result.linha == ['e4']


@pytest.mark.parametrize('info', [{}, fake_info(pv=[]), fake_info(pv=[chess.Move.from_uci('e2e5')])])
def test_malformed_engine_result_is_engine_error_and_closed(info):
    motor = FakeEngine(info)
    with pytest.raises(engine.ErroDoMotor):
        engine.analisar_posicao(INITIAL, abrir=lambda: motor)
    assert motor.events[-2:] == ['quit', 'close']


@pytest.mark.parametrize('error', [chess.engine.EngineError('uci failed'), TimeoutError(), OSError()])
def test_engine_failure_is_closed(error):
    motor = FakeEngine(error=error)
    with pytest.raises(engine.ErroDoMotor):
        engine.analisar_posicao(INITIAL, abrir=lambda: motor)
    assert motor.events[-2:] == ['quit', 'close']


def test_close_runs_when_quit_fails():
    motor = FakeEngine(fake_info())
    def quit():
        raise chess.engine.EngineTerminatedError()
    motor.quit = quit
    assert engine.analisar_posicao(INITIAL, abrir=lambda: motor).melhor_lance
    assert motor.events[-1] == 'close'


@pytest.mark.parametrize('fen', ['invalid', '8/8/8/8/8/8/8/8 w - - 0 1'])
def test_invalid_position_never_opens_engine(fen):
    with pytest.raises(engine.PosicaoInvalida):
        engine.analisar_posicao(fen, abrir=lambda: pytest.fail('must not open'))


@pytest.mark.parametrize('time_limit', [0, -1, float('nan'), float('inf')])
def test_invalid_budget_never_opens_engine(time_limit):
    with pytest.raises(ValueError):
        engine.analisar_posicao(INITIAL, time_limit, abrir=lambda: pytest.fail('must not open'))


@pytest.mark.parametrize('uci', ['e2e5', 'a1a8', 'a1a1', 'malformed'])
def test_selected_move_must_be_legal(uci):
    with pytest.raises(ValueError):
        engine.aplicar_movimento(INITIAL, uci)


def test_underpromotion_is_explicit_and_legal():
    fen = '7k/P7/8/8/8/8/8/K7 w - - 0 1'
    result = chess.Board(engine.aplicar_movimento(fen, 'a7a8n'))
    assert result.piece_type_at(chess.A8) == chess.KNIGHT


@pytest.mark.parametrize('fen,winner', [(CHECKMATE, 'black'), (chess.Board(CHECKMATE).mirror().fen(), 'white')])
def test_terminal_mate_zero_has_explicit_winner(fen, winner):
    result = engine.analisar_posicao(fen, abrir=lambda: pytest.fail('terminal does not need Stockfish'))
    assert result.status == 'checkmate' and result.mate == 0 and result.pontos is None
    assert result.vencedor == winner and result.melhor_lance is None


@pytest.mark.parametrize('fen,status', [('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'stalemate'),
                                        ('7k/8/8/8/8/8/8/K7 w - - 0 1', 'insufficient_material')])
def test_terminal_draw_has_no_invented_score(fen, status):
    result = engine.analisar_posicao(fen, abrir=lambda: pytest.fail('terminal'))
    assert result.status == status and result.mate is None and result.pontos is None


def test_import_and_engine_have_no_language_or_retrieval_dependency():
    code = '''import sys
import chess_engine as engine
result = engine.analisar_posicao("7k/8/8/8/8/8/8/K7 w - - 0 1")
assert result.status == "insufficient_material"
for name in sys.modules:
    assert not name.startswith(("llm", "retrieval", "ingest", "guardrails", "agents", "langchain", "langgraph", "chromadb", "sentence_transformers")), name
'''
    subprocess.run([sys.executable, '-c', code], env={**os.environ, 'PYTHONPATH': os.getcwd()}, check=True)


@pytest.mark.skipif(engine.caminho_do_stockfish() is None, reason='Stockfish não instalado')
def test_real_engine_concurrent_analyses_are_legal_and_close_processes(monkeypatch):
    processes = []
    original = engine.abrir_motor
    def open_engine():
        motor = original()
        processes.append(motor.transport.get_pid())
        return motor
    monkeypatch.setattr(engine, 'abrir_motor', open_engine)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda fen: engine.analisar_posicao(fen, 0.05), [INITIAL, BLACK]))
    for result in results:
        assert result.pontos is not None and result.perspectiva == 'white'
        engine.movimento_legal(result.fen, result.melhor_lance_uci)
        fen = result.fen
        for uci in result.linha_uci:
            fen = engine.aplicar_movimento(fen, uci)
    assert len(processes) == 2
    for pid in processes:
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)


@pytest.mark.skipif(engine.caminho_do_stockfish() is None, reason='Stockfish não instalado')
@pytest.mark.parametrize('fen,mate', [(MATE, 1), (chess.Board(MATE).mirror().fen(), -1)])
def test_real_engine_mate_perspective(fen, mate):
    result = engine.analisar_posicao(fen, 0.1)
    assert result.mate == mate and result.pontos is None
    board = chess.Board(engine.aplicar_movimento(fen, result.melhor_lance_uci))
    assert board.is_checkmate()
