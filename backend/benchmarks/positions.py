"""Project-created positions, no external games or player attribution."""
from dataclasses import dataclass
import chess


@dataclass(frozen=True)
class Position:
    id: str
    fen: str
    category: str
    description: str
    origin: str = 'synthetic/project-test'


def line(*moves):
    board = chess.Board()
    for move in moves: board.push_san(move)
    return board.fen()


POSITIONS = (
    Position('development', chess.STARTING_FEN, 'opening/development', 'Initial position: develop pieces or advance pawns.'),
    Position('center', line('e4','e5','Nf3','Nc6'), 'center', 'Open center, minor-piece development alternatives.'),
    Position('closed', line('d4','d5','c4','e6','Nc3','Nf6','Nf3','Be7','e3','O-O'), 'closed', 'Closed pawn chains and development.'),
    Position('open', line('e4','e5','Nf3','Nc6','d4','exd4','Nxd4','Nf6'), 'open', 'Open central files after pawn exchange.'),
    Position('king_attack', '6k1/5ppp/8/8/8/2B5/5PPP/3R2K1 w - - 0 1', 'king_attack', 'Rook and bishop activity against king shelter.'),
    Position('capture', '4k3/8/8/3q4/8/2N5/4P3/4K3 w - - 0 1', 'capture', 'Knight can capture an undefended queen.'),
    Position('check', '4k3/8/8/8/8/8/4P3/R3K3 w Q - 0 1', 'check', 'Rook checks compete with pawn advances.'),
    Position('tactical', '6k1/5ppp/8/8/3q4/2N5/5PPP/3R2K1 w - - 0 1', 'tactical', 'Knight capture and rook checks with exposed queen.'),
    Position('positional', line('d4','Nf6','c4','e6','Nf3','d5','Nc3','Be7'), 'positional', 'Development and castling preparation.'),
    Position('equivalent', line('Nf3','Nf6'), 'approximately_equivalent', 'Quiet symmetric development; eligibility measured, not assumed.'),
    Position('endgame', '8/4k3/7p/8/3K4/8/4P2P/8 w - - 0 1', 'endgame', 'King and pawn endgame.'),
    Position('single', '7k/5K2/6R1/8/8/8/8/8 b - - 0 1', 'single_legal_move', 'Black has exactly one legal king move.'),
    Position('mate_white', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'winning_mate', 'White has a back-rank mate in one.'),
    Position('mate_black', chess.Board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1').mirror().fen(), 'winning_mate', 'Mirrored black back-rank mate.'),
    Position('quality', '4k3/8/8/3q4/8/2N5/4P3/4K3 w - - 0 1', 'quality_guard', 'Ignoring a free queen is a substantial quality concession.'),
    Position('losing_mate', '7k/8/5K2/4Q3/8/8/8/8 b - - 0 1', 'losing_mate', 'Black has two legal moves, both lose to mate in two.'),
)
