"""Identidade do adversário é resolvida separadamente do mecanismo de decisão."""
import chess
import chess_engine
from games import Opponent


class StockfishPolicy:
    def choose_move(self, board: chess.Board, legal_moves: tuple[str, ...], config: Opponent) -> str:
        # agent_id é um identificador legado; não determina o executável do motor.
        return chess_engine.escolher_lance(board)
