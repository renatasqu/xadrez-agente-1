import chess
import pytest
from chess_engine import reconstruir_partida, estado_tabuleiro, estado_posicao, aplicar_na_partida, lances_legais


def test_repeticao():
    moves = ['g1f3','g8f6','f3g1','f6g8'] * 2
    board = reconstruir_partida(chess.STARTING_FEN, moves)
    assert estado_tabuleiro(board)['status'] == 'repetition'
    assert estado_posicao(board.fen())['status'] == 'playing'
    assert lances_legais(chess.STARTING_FEN, moves) == []
    with pytest.raises(ValueError):
        aplicar_na_partida(chess.STARTING_FEN, moves, 'e2e4')


@pytest.mark.parametrize('piece', ['q','r','b','n'])
def test_promocao(piece):
    board = reconstruir_partida('7k/P7/8/8/8/8/8/7K w - - 0 1', ['a7a8' + piece])
    assert board.piece_at(chess.A8).symbol() == piece.upper()


@pytest.mark.parametrize('move', ['e7e5','e2e5','garbage','e2e4q'])
def test_ilegal(move):
    moves = []
    with pytest.raises(ValueError):
        aplicar_na_partida(chess.STARTING_FEN, moves, move)
    assert moves == []


@pytest.mark.parametrize('fen,status', [
    ('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1','checkmate'),
    ('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1','stalemate'),
    ('7k/8/8/8/8/8/8/K7 w - - 0 1','insufficient_material'),
    ('7k/8/8/8/8/8/R7/K7 w - - 100 51','fifty_move'),
    ('7k/7R/8/8/8/8/8/K7 b - - 0 1','check')])
def test_estado(fen,status):
    assert estado_posicao(fen)['status'] == status
    assert estado_posicao(fen)['ended'] == (status != 'check')


def test_mate_e_fen():
    board = reconstruir_partida(chess.STARTING_FEN, ['f2f3','e7e5','g2g4','d8h4'])
    assert estado_tabuleiro(board)['winner'] == 'black'
    assert len(lances_legais(chess.STARTING_FEN)) == 20
    with pytest.raises(ValueError):
        reconstruir_partida('invalid', [])
