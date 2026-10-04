"""Validação local: python-chess decide a legalidade, fatos explicam a tentativa."""

from dataclasses import dataclass

import chess

from .models import (
    AllowsMateFact, AvoidMaterialLossGoal, IllegalMoveFact, MaterialLossFact,
    AnswerAction, AnswerPositionQuestionGoal, CastlingRightAbsentFact,
    DestinationAttackedFact, Exercise, ExerciseAction, ExerciseClientError, Fact, ForkFact, InvalidKnightGeometryFact,
    KnightForkGainGoal, MaterialGainFact, OpponentReplyFact, PieceRef,
    KingInCheckFact, LeavesKingInCheckFact, LegalDestinationFact, MoveAction,
    OwnPieceOnDestinationFact, PathOccupiedFact, ReachLegalSquareGoal,
    RookUnavailableFact, StraightKnightMoveFact, TransitAttackedFact,
    RefutationLineFact, RefutationReason, ValidationResult, WrongPieceFact, WrongSourceFact,
)


def knight_move_fact(board: chess.Board, action: MoveAction, expected_source: str) -> Fact:
    """Precedência: peça (tipo/cor/vazio), origem, ocupação, reta, geometria, xeque.

    Outro cavalo da mesma cor é origem errada; qualquer outra peça é peça errada.
    A tentativa mantém as casas originais mesmo quando não é um lance legal.
    """
    source, destination = chess.parse_square(action.source), chess.parse_square(action.destination)
    fields = dict(source=action.source, destination=action.destination)
    if board.piece_at(source) != chess.Piece(chess.KNIGHT, board.turn):
        fact = WrongPieceFact(**fields)
    elif action.source != expected_source:
        fact = WrongSourceFact(**fields, expected_source=expected_source)
    elif (piece := board.piece_at(destination)) and piece.color == board.turn:
        fact = OwnPieceOnDestinationFact(**fields)
    else:
        dx = abs(chess.square_file(source) - chess.square_file(destination))
        dy = abs(chess.square_rank(source) - chess.square_rank(destination))
        if dx == 0 or dy == 0:
            fact = StraightKnightMoveFact(**fields)
        elif sorted((dx, dy)) != [1, 2]:
            fact = InvalidKnightGeometryFact(**fields)
        elif board.is_legal(chess.Move(source, destination)):
            fact = LegalDestinationFact(**fields)
        else:
            fact = LeavesKingInCheckFact(**fields)
    return fact


def reach_legal_square(exercise: Exercise, action: MoveAction) -> ValidationResult:
    """A1 conclui ao alcançar uma casa legal com o cavalo indicado."""
    goal = exercise.goal
    if not isinstance(goal, ReachLegalSquareGoal):
        raise ValueError("Objetivo incompatível")
    board = chess.Board(exercise.fen)
    fact = knight_move_fact(board, action, goal.piece.square)
    accepted = isinstance(fact, LegalDestinationFact)
    resulting_fen = exercise.fen
    if accepted:
        board.push(chess.Move.from_uci(action.source + action.destination))
        resulting_fen = board.fen()
    # Uma tentativa legal rejeitada pelo objetivo também preserva o estado autoritativo.
    return ValidationResult(
        status="correct" if accepted else "incorrect",
        resulting_fen=resulting_fen, facts=[fact],
    )


def answer_position_question(exercise: Exercise, action: AnswerAction) -> ValidationResult:
    """Roque ortodoxo para o lado a jogar; acumula todos os impedimentos aplicáveis."""
    goal = exercise.goal
    if not isinstance(goal, AnswerPositionQuestionGoal):
        raise ValueError("Objetivo incompatível")
    board = chess.Board(exercise.fen)
    rank = 0 if board.turn == chess.WHITE else 7
    kingside = goal.side == "kingside"
    king = chess.square(4, rank)
    rook = chess.square(7 if kingside else 0, rank)
    transit = chess.square(5 if kingside else 3, rank)
    destination = chess.square(6 if kingside else 2, rank)
    legal = board.is_legal(chess.Move(king, destination)) and board.is_castling(chess.Move(king, destination))
    facts = []
    # FEN registra o direito atual, não o evento histórico que o removeu.
    if not board.castling_rights & chess.BB_SQUARES[rook]:
        facts.append(CastlingRightAbsentFact(side=goal.side))
    if board.piece_at(rook) != chess.Piece(chess.ROOK, board.turn) or board.promoted & chess.BB_SQUARES[rook]:
        facts.append(RookUnavailableFact(square=chess.square_name(rook)))
    occupied = [chess.square_name(chess.square(file, rank)) for file in ((5, 6) if kingside else (1, 2, 3)) if board.piece_at(chess.square(file, rank))]
    if occupied:
        facts.append(PathOccupiedFact(squares=occupied))
    if board.is_check():
        facts.append(KingInCheckFact(square=chess.square_name(board.king(board.turn))))
    # Remover o rei revela ataques que ele próprio bloqueava na origem.
    occupancy = board.occupied & ~chess.BB_SQUARES[king]
    for square, fact_type in ((transit, TransitAttackedFact), (destination, DestinationAttackedFact)):
        if board.attackers(not board.turn, square, occupied=occupancy):
            facts.append(fact_type(square=chess.square_name(square)))
    return ValidationResult(
        status="correct" if action.answer == legal else "incorrect",
        resulting_fen=exercise.fen, facts=facts,
    )


MATERIAL_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}


def material_balance(board: chess.Board, student_color: chess.Color) -> int:
    """Saldo em pontos materiais do aluno; o rei não tem valor material."""
    return sum(
        value * (len(board.pieces(piece, student_color)) - len(board.pieces(piece, not student_color)))
        for piece, value in MATERIAL_VALUES.items()
    )


def _fork_targets(board: chess.Board, square: chess.Square, student_color: chess.Color) -> list[PieceRef]:
    """Ataques geométricos relevantes na posição imediatamente após o lance."""
    return [
        PieceRef(square=chess.square_name(target), piece=chess.piece_name(piece.piece_type),
                 color="white" if piece.color else "black")
        for target in sorted(board.attacks(square), key=chess.square_name)
        if (piece := board.piece_at(target)) and piece.color != student_color and piece.piece_type != chess.PAWN
    ]


def _targets_after_reply(board: chess.Board, reply: chess.Move, targets: list[PieceRef]) -> list[PieceRef]:
    """Segue a identidade dos alvos quando a defesa os desloca, inclusive no roque."""
    moved = {reply.from_square: reply.to_square}
    if board.is_castling(reply):
        rank = chess.square_rank(reply.from_square)
        kingside = board.is_kingside_castling(reply)
        moved[chess.square(7 if kingside else 0, rank)] = chess.square(5 if kingside else 3, rank)
    return [
        target.model_copy(update={"square": chess.square_name(moved.get(chess.parse_square(target.square), chess.parse_square(target.square)))})
        for target in targets if target.piece != "king"
    ]


@dataclass(frozen=True)
class _ForkLine:
    """Testemunha interna de conversão ou refutação dentro dos quatro plies."""

    moves: tuple[str, ...]
    board: chess.Board
    net_gain: int
    reason: RefutationReason | None


def _fork_line(board: chess.Board, moves: tuple[str, ...], initial_balance: int,
               student_color: chess.Color, required_gain: int,
               reason: RefutationReason | None = None) -> _ForkLine:
    """Mate/empates automáticos falham; não considera claims de 50 lances/repetição."""
    gain = material_balance(board, student_color) - initial_balance
    if board.is_game_over(claim_draw=False):
        reason = "terminal_failure"
    elif reason is None and gain < required_gain:
        reason = "insufficient_gain"
    return _ForkLine(moves, board, gain, reason)


def _canonical_defense(lines: list[_ForkLine]) -> _ForkLine:
    """Refutar tem prioridade sobre material: esta política é específica de A3.

    Entre refutações, ou entre sucessos quando não há refutação, minimiza ganho;
    empates usam UCI lexicográfico. Não é minimax puramente material.
    """
    failures = [line for line in lines if line.reason is not None]
    return min(failures or lines, key=lambda line: (line.net_gain, line.moves))


def _reply_after_capture(board: chess.Board, initial_balance: int,
                         student_color: chess.Color, required_gain: int) -> _ForkLine:
    """Enumera a última defesa para não confundir captura bruta com ganho líquido."""
    if board.is_game_over(claim_draw=False):
        return _fork_line(board, (), initial_balance, student_color, required_gain, "terminal_failure")
    lines = []
    for reply in sorted(board.legal_moves, key=lambda move: move.uci()):
        final = board.copy()
        final.push(reply)
        lines.append(_fork_line(final, (reply.uci(),), initial_balance, student_color, required_gain))
    return _canonical_defense(lines)


def _best_conversion(board: chess.Board, knight_square: chess.Square, targets: list[PieceRef],
                     initial_balance: int, student_color: chess.Color, required_gain: int) -> _ForkLine:
    """O aluno escolhe sua melhor captura de um alvo original contra a última defesa."""
    if board.is_game_over(claim_draw=False):
        return _fork_line(board, (), initial_balance, student_color, required_gain, "terminal_failure")
    if board.piece_at(knight_square) != chess.Piece(chess.KNIGHT, student_color):
        return _fork_line(board, (), initial_balance, student_color, required_gain, "attacker_lost")
    target_squares = {chess.parse_square(target.square) for target in targets}
    lines = []
    for capture in sorted(board.legal_moves, key=lambda move: move.uci()):
        if capture.from_square != knight_square or capture.to_square not in target_squares or not board.is_capture(capture):
            continue
        after_capture = board.copy()
        after_capture.push(capture)
        reply = _reply_after_capture(after_capture, initial_balance, student_color, required_gain)
        lines.append(_ForkLine((capture.uci(),) + reply.moves, reply.board, reply.net_gain, reply.reason))
    if not lines:
        return _fork_line(board, (), initial_balance, student_color, required_gain, "target_not_converted")
    successes = [line for line in lines if line.reason is None]
    return min(successes or lines, key=lambda line: (-line.net_gain, line.moves))


def _first_reply(board: chess.Board, knight_square: chess.Square, targets: list[PieceRef],
                  initial_balance: int, student_color: chess.Color, required_gain: int) -> _ForkLine:
    """Exige conversão suficiente contra TODAS as respostas adversárias legais."""
    if board.is_game_over(claim_draw=False):
        return _fork_line(board, (), initial_balance, student_color, required_gain, "terminal_failure")
    lines = []
    for reply in sorted(board.legal_moves, key=lambda move: move.uci()):
        remaining_targets = _targets_after_reply(board, reply, targets)
        after_reply = board.copy()
        after_reply.push(reply)
        conversion = _best_conversion(after_reply, knight_square, remaining_targets,
                                      initial_balance, student_color, required_gain)
        lines.append(_ForkLine((reply.uci(),) + conversion.moves, conversion.board,
                               conversion.net_gain, conversion.reason))
    return _canonical_defense(lines)


def _refutation(line: _ForkLine, prefix: str, required_gain: int) -> RefutationLineFact:
    """Linha hipotética começa na posição autoritativa anterior à tentativa."""
    if line.reason is None:
        raise ValueError("Linha não refutada")
    return RefutationLineFact(reason=line.reason, moves=[prefix, *line.moves],
                              resulting_fen=line.board.fen(), net_gain=line.net_gain,
                              required_gain=required_gain)


def _fork_attempt(exercise: Exercise, board: chess.Board, action: MoveAction,
                   history: list[str]) -> ValidationResult:
    """Valida uma etapa sem avançar o estado autoritativo em caso de rejeição."""
    goal = exercise.goal
    if not isinstance(goal, KnightForkGainGoal):
        raise ValueError("Objetivo incompatível")
    student_color = goal.piece.color == "white"
    initial_balance = material_balance(chess.Board(exercise.fen), student_color)
    previous_fen = board.fen() if history else exercise.fen
    expected_source = history[0][2:4] if history else goal.piece.square
    diagnostic = knight_move_fact(board, action, expected_source)
    if not isinstance(diagnostic, LegalDestinationFact):
        return ValidationResult(status="incorrect", resulting_fen=previous_fen,
                                history=history, facts=[diagnostic])
    move = chess.Move.from_uci(action.source + action.destination)
    attempted = board.copy()
    attempted.push(move)
    facts: list[Fact] = []
    if not history:
        targets = _fork_targets(attempted, move.to_square, student_color)
        if len(targets) < 2:
            line = _fork_line(attempted, (), initial_balance, student_color, goal.min_material_gain, "no_fork")
        else:
            facts.append(ForkFact(attacker=PieceRef(square=action.destination, color=goal.piece.color),
                                  square=action.destination, targets=targets,
                                  gives_check=attempted.is_check(), fen=attempted.fen()))
            line = _first_reply(attempted, move.to_square, targets, initial_balance,
                                student_color, goal.min_material_gain)
    else:
        fork_position = chess.Board(exercise.fen)
        fork_position.push_uci(history[0])
        targets = _fork_targets(fork_position, chess.parse_square(expected_source), student_color)
        targets = _targets_after_reply(fork_position, chess.Move.from_uci(history[1]), targets)
        if not board.is_capture(move) or action.destination not in {target.square for target in targets}:
            line = _fork_line(attempted, (), initial_balance, student_color,
                              goal.min_material_gain, "target_not_converted")
        else:
            line = _reply_after_capture(attempted, initial_balance, student_color, goal.min_material_gain)
    if line.reason is not None:
        facts.append(_refutation(line, move.uci(), goal.min_material_gain))
        return ValidationResult(status="incorrect", resulting_fen=previous_fen, history=history, facts=facts)
    # A busca pode conter a futura captura; apenas a resposta imediata é aplicada.
    reply = line.moves[0]
    attempted.push_uci(reply)
    canonical_history = [*history, move.uci(), reply]
    facts.append(OpponentReplyFact(move=reply, policy=goal.opponent_policy))
    if history:
        final_balance = material_balance(attempted, student_color)
        facts.append(MaterialGainFact(initial_balance=initial_balance, final_balance=final_balance,
                                      net_gain=final_balance - initial_balance,
                                      required_gain=goal.min_material_gain, fen=attempted.fen()))
    return ValidationResult(status="correct" if history else "partial", resulting_fen=attempted.fen(),
                            history=canonical_history, facts=facts)


def knight_fork_gain(exercise: Exercise, action: MoveAction, history: list[str]) -> ValidationResult:
    """Replay comprova validade no exercício atual, não origem/emissão anterior.

    Cada par é revalidado desde o catálogo; o cliente não escolhe a defesa.
    """
    if len(history) > 4 or len(history) % 2:
        raise ExerciseClientError("invalid_history", "Histórico inválido: exige pares completos e no máximo quatro plies")
    board = chess.Board(exercise.fen)
    if board.is_game_over(claim_draw=False):
        # Defesa adicional para objetos construídos sem os validadores Pydantic.
        raise RuntimeError("A3 exige uma posição inicial não terminal")
    canonical: list[str] = []
    for index in range(0, len(history), 2):
        try:
            past_move = chess.Move.from_uci(history[index])
        except ValueError as error:
            raise ExerciseClientError("invalid_history", "Histórico inválido: UCI malformado") from error
        past_action = MoveAction(source=chess.square_name(past_move.from_square),
                                 destination=chess.square_name(past_move.to_square))
        result = _fork_attempt(exercise, board, past_action, canonical)
        if result.status == "incorrect" or result.history != history[:index + 2]:
            raise ExerciseClientError("invalid_history", "Histórico inválido: ação rejeitada ou resposta adversária não canônica")
        canonical = result.history
        board.push_uci(canonical[-2])
        board.push_uci(canonical[-1])
        if result.status == "correct":
            raise ExerciseClientError("invalid_history", "Histórico inválido: exercício já concluído")
    return _fork_attempt(exercise, board, action, canonical)


@dataclass(frozen=True)
class _SafetyLine:
    """Prova limitada de E1: mate, variação material e desempate UCI."""

    score: tuple[int, int]
    moves: tuple[str, ...]
    board: chess.Board


def _safety_line(board: chess.Board, remaining: int, student_color: chess.Color,
                 initial_balance: int, moves: tuple[str, ...]) -> _SafetyLine:
    """Busca exclusiva de E1; enumera todos os lances, inclusive recuperações quietas.

    Aluno maximiza, adversário minimiza. Mate tem prioridade sobre material;
    empate automático encerra o ramo sem reprovação material. Não usa claims.
    """
    if board.is_checkmate():
        return _SafetyLine((-1 if board.turn == student_color else 1, 0), moves, board)
    if board.is_game_over(claim_draw=False):
        return _SafetyLine((0, 0), moves, board)
    if remaining == 0:
        return _SafetyLine((0, material_balance(board, student_color) - initial_balance), moves, board)
    lines = []
    for move in board.legal_moves:
        following = board.copy()
        following.push(move)
        lines.append(_safety_line(following, remaining - 1, student_color, initial_balance, moves + (move.uci(),)))
    best_score = (max if board.turn == student_color else min)(line.score for line in lines)
    return min((line for line in lines if line.score == best_score), key=lambda line: line.moves)


def avoid_material_loss(exercise: Exercise, action: MoveAction) -> ValidationResult:
    """Uma ação real; respostas simuladas nunca alteram o estado autoritativo."""
    goal = exercise.goal
    if not isinstance(goal, AvoidMaterialLossGoal):
        raise ValueError("Objetivo incompatível")
    board = chess.Board(exercise.fen)
    if board.is_game_over(claim_draw=False):
        raise RuntimeError("E1 exige uma posição inicial não terminal")
    student_color = board.turn
    source, destination = chess.parse_square(action.source), chess.parse_square(action.destination)
    fields = dict(source=action.source, destination=action.destination)
    move = chess.Move(source, destination)
    if not board.is_legal(move):
        piece = board.piece_at(source)
        target = board.piece_at(destination)
        if piece is None or piece.color != student_color:
            fact = WrongPieceFact(**fields)
        elif target is not None and target.color == student_color:
            fact = OwnPieceOnDestinationFact(**fields)
        elif board.is_pseudo_legal(move):
            fact = LeavesKingInCheckFact(**fields)
        else:
            fact = IllegalMoveFact(**fields)
        return ValidationResult(status="incorrect", resulting_fen=exercise.fen, facts=[fact])
    initial = material_balance(board, student_color)
    board.push(move)
    candidate_fen = board.fen()
    line = _safety_line(board, goal.horizon_plies - 1, student_color, initial, (move.uci(),))
    if line.score[0] == -1:
        fact = AllowsMateFact(
            mated_king=PieceRef(square=chess.square_name(line.board.king(student_color)),
                                piece="king", color="white" if student_color else "black"),
            moves=list(line.moves), resulting_fen=line.board.fen(),
        )
    elif line.score[0] == 0 and line.score[1] < -goal.max_material_loss:
        final = material_balance(line.board, student_color)
        fact = MaterialLossFact(initial_balance=initial, final_balance=final,
                                loss=initial - final, max_material_loss=goal.max_material_loss,
                                moves=list(line.moves), resulting_fen=line.board.fen())
    else:
        return ValidationResult(status="correct", resulting_fen=candidate_fen,
                                facts=[LegalDestinationFact(**fields)])
    return ValidationResult(status="incorrect", resulting_fen=exercise.fen, facts=[fact])


def validate(exercise: Exercise, action: ExerciseAction, history: list[str] | None = None) -> ValidationResult:
    """API local stateless; erros de histórico são de protocolo, não pedagógicos."""
    history = list(history or [])
    if isinstance(exercise.goal, KnightForkGainGoal) and isinstance(action, MoveAction):
        return knight_fork_gain(exercise, action, history)
    if history:
        raise ExerciseClientError("invalid_history", "Histórico não permitido para este exercício")
    if isinstance(exercise.goal, AvoidMaterialLossGoal) and isinstance(action, MoveAction):
        return avoid_material_loss(exercise, action)
    if isinstance(exercise.goal, ReachLegalSquareGoal) and isinstance(action, MoveAction):
        return reach_legal_square(exercise, action)
    if isinstance(exercise.goal, AnswerPositionQuestionGoal) and isinstance(action, AnswerAction):
        return answer_position_question(exercise, action)
    raise ExerciseClientError("incompatible_action", "Tipo de ação incompatível com o exercício")
