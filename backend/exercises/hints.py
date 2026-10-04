"""Dicas curadas; contexto e casas são reconstruídos exclusivamente no servidor."""
import chess

from .models import (AnswerAction, AnswerPositionQuestionGoal, Exercise, ExerciseClientError,
                     Hint, HintRequest, KnightForkGainGoal, MoveAction, ReachLegalSquareGoal)
from .validation import validate

CONCEPTS = {
    "straight_knight_move": "O cavalo não se move em linha reta.",
    "invalid_knight_geometry": "O cavalo se move em L: duas casas em uma direção e uma na perpendicular.",
    "wrong_source": "Observe qual peça a instrução pede para mover.",
    "wrong_piece": "Escolha uma peça sua adequada ao objetivo.",
    "own_piece_on_destination": "Uma peça não pode ocupar a casa de outra peça sua.",
    "leaves_king_in_check": "Antes de jogar, confira se seu rei continuará protegido.",
    "illegal_move": "Confira o movimento da peça e os obstáculos no caminho.",
    "castling_right_absent": "O roque depende também dos direitos registrados na posição.",
    "rook_unavailable": "O roque exige o rei e a torre correspondente.",
    "path_occupied": "Para rocar, o caminho entre rei e torre precisa estar livre.",
    "king_in_check": "Confira se o rei está sob ataque antes de considerar o roque.",
    "transit_attacked": "No roque, o rei precisa atravessar casas livres de ataque.",
    "destination_attacked": "No roque, a casa final do rei precisa estar livre de ataque.",
    "material_loss": "Considere a resposta adversária: uma peça pode ficar exposta a uma captura.",
    "allows_mate": "Priorize a segurança do rei: procure ameaças de mate na resposta adversária.",
    "refutation_line": "Um garfo precisa permitir ganho material mesmo depois da defesa adversária.",
}


def next_hint(exercise: Exercise, request: HintRequest) -> Hint | None:
    goal = exercise.goal
    # O replay de A3 é o mesmo dos validadores atuais, inclusive defesa canônica.
    probe = request.last_action or MoveAction(source="a1", destination="a2")
    if isinstance(goal, AnswerPositionQuestionGoal) and request.last_action is None:
        probe = AnswerAction(answer=True)
    result = validate(exercise, probe, request.history)
    board = chess.Board(exercise.fen)
    for move in request.history:
        board.push_uci(move)
    if request.last_action is not None and result.status != "incorrect":
        raise ExerciseClientError("invalid_request", "Solicite a dica na etapa atual, sem uma ação já aceita")
    if request.current_hint_level == 3:
        return None
    facts = result.facts if request.last_action is not None else []
    code = facts[-1].code if facts else ""
    concept = CONCEPTS.get(code)
    if code == "refutation_line":
        concept = {
            "no_fork": "Procure uma casa de onde o cavalo ataque dois alvos ao mesmo tempo.",
            "attacker_lost": "O cavalo precisa sobreviver à defesa para converter o garfo.",
            "target_not_converted": "Depois da defesa, procure capturar um dos alvos do garfo.",
            "insufficient_gain": "Considere possíveis recapturas: a captura precisa produzir ganho líquido suficiente.",
            "terminal_failure": "Confira se a sequência mantém a partida em condições de atingir o objetivo.",
        }[facts[-1].reason]
    level = request.current_hint_level + 1
    squares: list[str] = []
    if isinstance(goal, AnswerPositionQuestionGoal):
        rank = "1" if board.turn else "8"
        path = ["e" + rank, *(file + rank for file in ("fg" if goal.side == "kingside" else "dc"))]
        squares = path + [("h" if goal.side == "kingside" else "a") + rank]
        texts = [(concept or "Confira os direitos de roque, o caminho livre e a segurança do rei."),
                 "Observe o rei, a torre desse lado e as casas por onde o rei passaria.",
                 f"Confira o percurso do rei: {', '.join(path)}. "
                 + (concept or "Verifique ocupação, ataques e o direito de rocar com a torre destacada.")]
    elif isinstance(goal, (ReachLegalSquareGoal, KnightForkGainGoal)):
        source = request.history[0][2:4] if request.history else goal.piece.square
        squares = [source]
        if isinstance(goal, ReachLegalSquareGoal):
            texts = [(concept or "O cavalo combina dois passos em uma direção e um na perpendicular."),
                     "Dê atenção às casas que ficam duas casas em uma direção e uma na perpendicular.",
                     "As casas destacadas são destinos legais para o cavalo indicado. Escolha uma delas."]
            if level == 3:
                squares = sorted({chess.square_name(m.to_square) for m in board.legal_moves if chess.square_name(m.from_square) == source})
        else:
            texts = [(concept or "Depois de atacar dois alvos, é preciso converter o garfo em ganho material."),
                     "Observe o cavalo destacado e os alvos adversários que ele pode atacar ou capturar.",
                     "Considere o destino destacado: ele permite continuar o objetivo contra a defesa adversária."]
            if level == 3:
                squares = []
                for move in sorted(board.legal_moves, key=lambda m: m.uci()):
                    if chess.square_name(move.from_square) != source:
                        continue
                    candidate = validate(exercise, MoveAction(source=source, destination=chess.square_name(move.to_square)), request.history)
                    if candidate.status != "incorrect":
                        squares.append(chess.square_name(move.to_square))
                if not squares:
                    squares = [source]
    else:
        king = chess.square_name(board.king(board.turn))
        squares = [king]
        if code == "material_loss":
            # A captura da refutação identifica a peça ameaçada sem aplicar a linha.
            squares = sorted({king, facts[-1].moves[1][2:4]})
        texts = [(concept or "Antes de jogar, examine capturas e ameaças de mate do adversário."),
                 "Examine a segurança do rei destacado." if code == "allows_mate" else "Observe as peças expostas e o rei nas casas destacadas.",
                 "Considere o lance entre as casas destacadas e confira a resposta adversária antes de executá-lo."]
        if level == 3:
            for move in sorted(board.legal_moves, key=lambda m: m.uci()):
                candidate = validate(exercise, MoveAction(source=chess.square_name(move.from_square), destination=chess.square_name(move.to_square)))
                if candidate.status == "correct":
                    squares = [chess.square_name(move.from_square), chess.square_name(move.to_square)]
                    break
    return Hint(level=level, code={1: "conceptual", 2: "piece_or_region", 3: "specific_squares"}[level],
                text=texts[level - 1], highlight_squares=squares if level > 1 else [])
