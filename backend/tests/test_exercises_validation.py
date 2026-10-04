"""Fixtures ortodoxas pequenas, verificadas pelo próprio python-chess."""

import chess
import pytest
import random

from exercises.catalog import CATALOG
from exercises.models import (
    AnswerAction, AnswerPositionQuestionGoal, Exercise, KnightForkGainGoal, MoveAction,
    PieceRef, ReachLegalSquareGoal,
)
from exercises.validation import _reply_after_capture, material_balance, validate


def knight(fen="4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1", source="b1"):
    assert chess.Board(fen).is_valid()
    return Exercise(id="test", prompt="Cavalo", fen=fen, goal=ReachLegalSquareGoal(piece=PieceRef(square=source, color="white")))


def castle(fen, side="kingside"):
    board = chess.Board(fen)
    assert not board.status() & ~chess.STATUS_BAD_CASTLING_RIGHTS
    return Exercise(id="test", prompt="Roque?", fen=fen, goal=AnswerPositionQuestionGoal(side=side))


@pytest.mark.parametrize("source,destination,code", [
    ("b1", "a3", "legal_destination"),
    ("c1", "d3", "wrong_source"),
    ("e1", "e2", "wrong_piece"),
    ("a1", "a3", "wrong_piece"),
    ("b1", "b3", "straight_knight_move"),
    ("b1", "d3", "invalid_knight_geometry"),
    ("b1", "c1", "own_piece_on_destination"),
])
def test_knight_diagnostics(source, destination, code):
    exercise = knight()
    result = validate(exercise, MoveAction(source=source, destination=destination))
    assert result.facts[0].code == code
    assert result.status == ("correct" if code == "legal_destination" else "incorrect")
    assert result.facts[0].source == source
    assert result.facts[0].destination == destination
    expected = chess.Board(exercise.fen)
    if code == "legal_destination":
        expected.push(chess.Move.from_uci(source + destination))
    assert result.resulting_fen == (expected.fen() if code == "legal_destination" else exercise.fen)
    assert result.next_hint is None


@pytest.mark.parametrize("fen,source,destination,code", [
    ("4k3/8/8/8/8/p7/8/1N2K3 w - - 0 1", "b1", "a3", "legal_destination"),
    ("k3r3/8/8/8/8/8/4N3/4K3 w - - 0 1", "e2", "c3", "leaves_king_in_check"),
    ("4k3/8/8/8/8/P7/8/1N2K3 w - - 0 1", "b1", "a3", "own_piece_on_destination"),
])
def test_knight_capture_pin_and_occupied(fen, source, destination, code):
    assert validate(knight(fen, source), MoveAction(source=source, destination=destination)).facts[0].code == code


@pytest.mark.parametrize("fen,side,legal,codes", [
    ("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "kingside", True, []),
    ("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "queenside", True, []),
    ("r3k2r/8/8/8/8/8/8/4K3 b kq - 0 1", "kingside", True, []),
    ("4k3/8/8/8/8/8/8/4K2R w - - 0 1", "kingside", False, ["castling_right_absent"]),
    ("k3r3/8/8/8/8/8/8/4K2R w K - 0 1", "kingside", False, ["king_in_check"]),
    ("k4r2/8/8/8/8/8/8/4K2R w K - 0 1", "kingside", False, ["transit_attacked"]),
    ("k5r1/8/8/8/8/8/8/4K2R w K - 0 1", "kingside", False, ["destination_attacked"]),
    ("4k3/8/8/8/8/8/8/4KB1R w K - 0 1", "kingside", False, ["path_occupied"]),
    ("k3r1r1/8/8/8/8/8/8/4KB1R w - - 0 1", "kingside", False, ["castling_right_absent", "path_occupied", "king_in_check", "destination_attacked"]),
    ("4k3/8/8/8/8/8/8/4K3 w K - 0 1", "kingside", False, ["rook_unavailable"]),
    ("4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1", "queenside", False, ["path_occupied"]),
])
def test_castling(fen, side, legal, codes):
    exercise = castle(fen, side)
    board = chess.Board(fen)
    destination = ("g" if side == "kingside" else "c") + ("1" if board.turn else "8")
    source = "e1" if board.turn else "e8"
    assert board.is_legal(chess.Move.from_uci(source + destination)) == legal
    correct = validate(exercise, AnswerAction(answer=legal))
    incorrect = validate(exercise, AnswerAction(answer=not legal))
    assert correct.status == "correct"
    assert incorrect.status == "incorrect"
    assert [fact.code for fact in correct.facts] == codes
    assert correct.facts == incorrect.facts
    assert correct.resulting_fen == incorrect.resulting_fen == exercise.fen
    assert correct.next_hint is incorrect.next_hint is None


def test_board_is_not_mutated():
    exercise = knight()
    before = exercise.model_dump()
    assert validate(exercise, MoveAction(source="b1", destination="a3")) == validate(exercise, MoveAction(source="b1", destination="a3"))
    assert exercise.model_dump() == before


def test_legal_move_rejected_by_goal_preserves_state():
    exercise = knight()
    action = MoveAction(source="c1", destination="d3")
    assert chess.Board(exercise.fen).is_legal(chess.Move.from_uci("c1d3"))
    result = validate(exercise, action)
    assert result.status == "incorrect"
    assert result.facts[0].code == "wrong_source"
    assert result.resulting_fen == exercise.fen
    assert result.next_hint is None


POSITIVE_FORK = "r3k3/8/8/1N3r2/8/8/8/4K2R w - - 0 1"
NEGATIVE_FORK = "r1r1k3/8/8/1N6/8/8/8/4K2R w - - 0 1"


def fork_exercise(fen=POSITIVE_FORK, source="b5", color="white", minimum=3):
    assert chess.Board(fen).is_valid()
    return Exercise(id="fork-test", prompt="Garfo", fen=fen,
                    goal=KnightForkGainGoal(piece=PieceRef(square=source, color=color), min_material_gain=minimum))


def move_action(uci):
    return MoveAction(source=uci[:2], destination=uci[2:4])


def replay(fen, moves):
    board = chess.Board(fen)
    assert board.is_valid()
    for uci in moves:
        move = chess.Move.from_uci(uci)
        assert move in board.legal_moves
        assert not board.is_game_over()
        board.push(move)
        assert board.is_valid()
    return board


@pytest.mark.parametrize("first,capture,last,targets", [
    ("b5c7", "c7a8", "d7c6", [("a8", "rook"), ("e8", "king")]),
    ("b5d6", "d6f5", "a8a1", [("e8", "king"), ("f5", "rook")]),
])
def test_two_fork_solutions_and_authoritative_results(first, capture, last, targets):
    exercise = CATALOG["a3-garfo-cavalo"]
    assert exercise.fen == POSITIVE_FORK
    assert material_balance(chess.Board(exercise.fen), chess.WHITE) == -2
    partial = validate(exercise, move_action(first))
    assert partial.status == "partial"
    assert partial.history == [first, "e8d7"]
    assert partial.resulting_fen == replay(exercise.fen, partial.history).fen()
    assert partial.next_hint is None
    assert [fact.code for fact in partial.facts] == ["fork", "opponent_reply"]
    fork, reply = partial.facts
    assert fork.attacker == PieceRef(square=first[2:], color="white")
    assert fork.square == first[2:]
    assert [(target.square, target.piece) for target in fork.targets] == targets
    assert all(target.color == "black" for target in fork.targets)
    assert fork.gives_check is True
    assert fork.fen == replay(exercise.fen, [first]).fen()
    assert reply.move == "e8d7" and reply.policy == "material_minimax_v1"
    complete = validate(exercise, move_action(capture), partial.history)
    assert complete.status == "correct"
    assert complete.history == [first, "e8d7", capture, last]
    final = replay(exercise.fen, complete.history)
    assert complete.resulting_fen == final.fen()
    assert final.turn == chess.WHITE
    assert material_balance(final, chess.WHITE) == 3
    gain = complete.facts[-1]
    assert gain.code == "material_gain"
    assert (gain.initial_balance, gain.final_balance, gain.net_gain, gain.required_gain) == (-2, 3, 5, 3)
    assert gain.fen == final.fen()
    assert complete.next_hint is None
    assert Exercise.model_validate(exercise.model_dump()) == exercise


@pytest.mark.parametrize("first", ["b5c7", "b5d6"])
def test_every_legal_defense_allows_the_minimum(first):
    # Oráculo da fixture: examina todos os lances legais, sem usar helpers da busca.
    fork = replay(POSITIVE_FORK, [first])
    original_targets = {square for square in fork.attacks(chess.parse_square(first[2:]))
                        if fork.piece_type_at(square) == chess.ROOK}
    defenses = list(fork.legal_moves)
    assert len(defenses) == (5 if first == "b5c7" else 4)
    for reply in defenses:
        after_reply = fork.copy()
        after_reply.push(reply)
        guaranteed_gains = []
        for capture in after_reply.legal_moves:
            if capture.from_square != chess.parse_square(first[2:]) or capture.to_square not in original_targets:
                continue
            captured = after_reply.copy()
            captured.push(capture)
            gains = []
            for last in captured.legal_moves:
                final = captured.copy()
                final.push(last)
                assert not final.is_game_over()
                # Contagem independente de torres e cavalo destas fixtures.
                white = 5 * len(final.pieces(chess.ROOK, chess.WHITE)) + 3 * len(final.pieces(chess.KNIGHT, chess.WHITE))
                black = 5 * len(final.pieces(chess.ROOK, chess.BLACK))
                gains.append(white - black - (-2))
            guaranteed_gains.append(min(gains))
        assert max(guaranteed_gains) == 5


def test_determinism_and_uci_tie_break_do_not_depend_on_enumeration(monkeypatch):
    exercise = fork_exercise()
    expected = validate(exercise, move_action("b5c7"))
    assert expected.history[-1] == "e8d7"
    assert validate(exercise, move_action("b5c7")) == expected
    original = chess.Board.generate_legal_moves

    def reversed_moves(board, from_mask=chess.BB_ALL, to_mask=chess.BB_ALL):
        yield from reversed(list(original(board, from_mask, to_mask)))

    monkeypatch.setattr(chess.Board, "generate_legal_moves", reversed_moves)
    assert validate(exercise, move_action("b5c7")) == expected
    final = validate(exercise, move_action("c7a8"), expected.history)
    assert final.history[-1] == "d7c6"


@pytest.mark.parametrize("first,reason,moves,gain", [
    ("b5c7", "attacker_lost", ["b5c7", "c8c7"], -3),
    ("b5d6", "insufficient_gain", ["b5d6", "e8d7", "d6c8", "a8c8"], 2),
])
def test_refuted_forks_roll_back_with_replayable_evidence(first, reason, moves, gain):
    exercise = fork_exercise(NEGATIVE_FORK)
    result = validate(exercise, move_action(first))
    assert result.status == "incorrect"
    assert result.history == [] and result.resulting_fen == exercise.fen
    assert result.facts[0].code == "fork"
    refutation = result.facts[-1]
    assert refutation.reason == reason
    assert refutation.moves == moves
    final = replay(exercise.fen, moves)
    assert refutation.resulting_fen == final.fen()
    assert refutation.net_gain == gain == material_balance(final, chess.WHITE) - (-2)
    assert refutation.required_gain == 3
    assert "opponent_reply" not in [fact.code for fact in result.facts]


def test_threshold_uses_net_gain_after_recapture():
    exercise = fork_exercise(NEGATIVE_FORK, minimum=2)
    first = validate(exercise, move_action("b5d6"))
    assert first.status == "partial"
    last = validate(exercise, move_action("d6c8"), first.history)
    assert last.status == "correct"
    assert last.history == ["b5d6", "e8d7", "d6c8", "a8c8"]
    assert last.facts[-1].net_gain == 2
    assert last.resulting_fen == replay(exercise.fen, last.history).fen()
    assert validate(fork_exercise(minimum=6), move_action("b5c7")).status == "incorrect"


@pytest.mark.parametrize("uci,code", [
    ("b5a3", "refutation_line"), ("b5b7", "straight_knight_move"),
    ("b5c6", "invalid_knight_geometry"), ("h1h2", "wrong_piece"),
])
def test_rejected_first_actions_preserve_initial_position(uci, code):
    exercise = fork_exercise()
    result = validate(exercise, move_action(uci))
    assert result.status == "incorrect"
    assert result.history == [] and result.resulting_fen == exercise.fen
    assert result.facts[-1].code == code
    if uci == "b5a3":
        assert result.facts[-1].reason == "no_fork"
        assert result.facts[-1].resulting_fen == replay(exercise.fen, [uci]).fen()


def test_wrong_knight_source_and_pawn_targets():
    exercise = fork_exercise("r3k3/8/8/1N3r2/8/8/8/1N2K2R w - - 0 1")
    result = validate(exercise, move_action("b1a3"))
    assert result.status == "incorrect"
    assert result.facts[0].code == "wrong_source" and result.facts[0].expected_source == "b5"
    pawns = fork_exercise("4k3/8/p7/1N6/8/8/8/4K2R w - - 0 1")
    result = validate(pawns, move_action("b5c7"))
    assert result.status == "incorrect"
    assert [fact.code for fact in result.facts] == ["refutation_line"]
    assert result.facts[0].reason == "no_fork"


@pytest.mark.parametrize("uci,code", [("c7b5", "refutation_line"), ("c7c6", "straight_knight_move"), ("b5c7", "wrong_piece")])
def test_rejected_continuation_preserves_partial_and_allows_retry(uci, code):
    exercise = fork_exercise()
    partial = validate(exercise, move_action("b5c7"))
    rejected = validate(exercise, move_action(uci), partial.history)
    assert rejected.status == "incorrect"
    assert rejected.resulting_fen == partial.resulting_fen and rejected.history == partial.history
    assert rejected.facts[-1].code == code
    assert partial.history == ["b5c7", "e8d7"]
    assert validate(exercise, move_action("c7a8"), rejected.history).status == "correct"


@pytest.mark.parametrize("history", [
    ["b5c7"], ["b5c7", "e8d8"], ["b5b7", "e8d7"], ["b5a3", "e8d7"],
    ["b5c7", "e8d7", "c7a8"], ["b5c7", "e8d7", "c7a8", "d7c6"],
    ["b5c7", "e8d7", "c7b5", "d7c6"], ["b5c7", "e8d7"] * 3,
])
def test_history_replays_only_accepted_canonical_turns(history):
    with pytest.raises(ValueError, match="Histórico inválido"):
        validate(fork_exercise(), move_action("c7a8"), history)


def test_refuted_action_cannot_be_inserted_in_history():
    with pytest.raises(ValueError, match="Histórico inválido"):
        validate(fork_exercise(NEGATIVE_FORK), move_action("c7a8"), ["b5c7", "c8c7"])


@pytest.mark.parametrize("piece,value", [(chess.PAWN, 1), (chess.KNIGHT, 3), (chess.BISHOP, 3), (chess.ROOK, 5), (chess.QUEEN, 9)])
def test_material_values_and_color_perspective(piece, value):
    board = chess.Board("4k3/8/8/8/8/8/8/4K3 w - - 0 1")
    assert board.is_valid()
    assert material_balance(board, chess.WHITE) == material_balance(board, chess.BLACK) == 0
    board.set_piece_at(chess.A2, chess.Piece(piece, chess.WHITE))
    assert board.is_valid()
    assert material_balance(board, chess.WHITE) == value
    assert material_balance(board, chess.BLACK) == -value


def test_black_student_uses_own_material_perspective():
    mirrored = chess.Board(POSITIVE_FORK).mirror()
    exercise = fork_exercise(mirrored.fen(), source="b4", color="black")
    partial = validate(exercise, move_action("b4c2"))
    assert partial.status == "partial"
    assert partial.facts[0].attacker.color == "black"
    assert all(target.color == "white" for target in partial.facts[0].targets)
    final = validate(exercise, move_action("c2a1"), partial.history)
    assert final.status == "correct"
    assert final.facts[-1].initial_balance == -2 and final.facts[-1].final_balance == 3
    assert final.facts[-1].net_gain == 5
    assert final.resulting_fen == replay(exercise.fen, final.history).fen()


def test_insufficient_material_after_capture_is_not_success():
    exercise = fork_exercise("r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1")
    result = validate(exercise, move_action("b5c7"))
    assert result.status == "incorrect"
    assert result.facts[-1].reason == "terminal_failure"
    assert result.facts[-1].moves == ["b5c7", "e8d7", "c7a8"]
    hypothetical = replay(exercise.fen, result.facts[-1].moves)
    assert hypothetical.is_insufficient_material()
    assert result.facts[-1].net_gain == 5
    assert result.history == [] and result.resulting_fen == exercise.fen


@pytest.mark.parametrize("fen", [
    "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",  # Afogamento após captura.
    "4k3/8/8/8/8/8/8/1N2K3 b - - 0 1",  # Material insuficiente.
    "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",  # Qh4# disponível.
])
def test_terminal_defense_cannot_prove_material_conversion(fen):
    board = chess.Board(fen)
    assert board.is_valid()
    # Saldo inicial artificial força ganho >= 3 e isola a rejeição por terminal.
    initial = material_balance(board, chess.WHITE) - 5
    line = _reply_after_capture(board, initial, chess.WHITE, 3)
    assert line.reason == "terminal_failure"
    assert line.net_gain >= 3
    final = replay(fen, line.moves)
    assert final.fen() == line.board.fen()
    assert final.is_stalemate() or final.is_insufficient_material() or (final.is_checkmate() and final.turn == chess.WHITE)


@pytest.mark.parametrize("history,uci", [([], "c7a8"), (["b5c7", "e8d7"], "d6f5"), (["b5d6", "e8d7"], "c7a8")])
def test_cannot_skip_or_mix_student_stages(history, uci):
    exercise = fork_exercise()
    previous = replay(exercise.fen, history)
    result = validate(exercise, move_action(uci), history)
    assert result.status == "incorrect"
    assert result.history == history and result.resulting_fen == previous.fen()


@pytest.mark.parametrize("history", [["b5c7q", "e8d7"], ["b5c7", "e8d7q"]])
def test_added_promotion_is_not_an_accepted_historical_move(history):
    from exercises.models import ExerciseClientError

    with pytest.raises(ExerciseClientError) as error:
        validate(fork_exercise(), move_action("c7a8"), history)
    assert error.value.code == "invalid_history"


@pytest.mark.parametrize("seed", [None, *range(10)])
def test_canonical_results_survive_reversed_and_shuffled_moves(monkeypatch, seed):
    exercise, negative = fork_exercise(), fork_exercise(NEGATIVE_FORK)

    def results():
        all_results = []
        for first, capture in (("b5c7", "c7a8"), ("b5d6", "d6f5")):
            partial = validate(exercise, move_action(first))
            all_results.extend([partial, validate(exercise, move_action(capture), partial.history)])
        all_results.extend(validate(negative, move_action(first)) for first in ("b5c7", "b5d6"))
        return all_results

    expected = results()
    original = chess.Board.generate_legal_moves
    rng = random.Random(seed)

    def reordered(board, from_mask=chess.BB_ALL, to_mask=chess.BB_ALL):
        moves = list(original(board, from_mask, to_mask))
        if seed is None:
            moves.reverse()
        else:
            rng.shuffle(moves)
        yield from moves

    monkeypatch.setattr(chess.Board, "generate_legal_moves", reordered)
    assert results() == expected


def test_refuting_objective_has_priority_over_smaller_material_gain():
    board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/3R2P1/5P2/PPPPP2P/1NBQKBNR b Kkq - 0 2")
    assert board.is_valid()
    # Isola a ordem da política: ambas as defesas têm material suficiente.
    initial = material_balance(board, chess.WHITE) - 8
    alternative = replay(board.fen(), ["e5d4"])
    assert not alternative.is_game_over(claim_draw=False)
    assert material_balance(alternative, chess.WHITE) - initial == 3
    chosen = _reply_after_capture(board, initial, chess.WHITE, 3)
    assert chosen.moves == ("d8h4",)
    assert chosen.reason == "terminal_failure" and chosen.net_gain == 8
    assert replay(board.fen(), chosen.moves).is_checkmate()


def test_terminal_initial_position_cannot_be_reopened_when_validation_is_bypassed():
    exercise = fork_exercise().model_copy(update={"fen": "r3k3/2r5/8/1N3r2/8/8/8/4K2R w - - 150 1"})
    assert chess.Board(exercise.fen).is_game_over(claim_draw=False)
    with pytest.raises(RuntimeError, match="posição inicial não terminal"):
        validate(exercise, move_action("b5c7"))


# E1: fixtures curadas; as testemunhas são reproduzidas legalmente pelo Board.
E1_SIMPLE = "2r1k3/8/8/8/8/2N5/8/4K3 w - - 0 1"
E1_EXCHANGE = "3rk3/8/8/3p4/8/8/6B1/3Q2KR w - - 0 1"
E1_MATE = "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2"
E1_BLACK = "4k3/8/2n5/8/8/8/8/2R1K3 b - - 0 1"


def safety(fen=E1_SIMPLE, limit=0):
    from exercises.models import AvoidMaterialLossGoal
    assert chess.Board(fen).is_valid()
    return Exercise(id="e1-test", prompt="Material", fen=fen,
                    goal=AvoidMaterialLossGoal(max_material_loss=limit))


def safety_result(exercise, uci, history=None):
    return validate(exercise, MoveAction(source=uci[:2], destination=uci[2:]), history)


@pytest.mark.parametrize("fen,uci,status,line,balances", [
    (E1_SIMPLE, "c3a4", "correct", None, None),
    (E1_SIMPLE, "c3d5", "correct", None, None),
    (E1_SIMPLE, "c3a2", "correct", None, None),
    (E1_SIMPLE, "e1f2", "incorrect", ["e1f2", "c8c3", "f2e1"], (-2, -5)),
    (E1_EXCHANGE, "d1d5", "incorrect", ["d1d5", "d8d5", "g2d5"], (11, 8)),
    (E1_EXCHANGE, "d1a4", "correct", None, None),
    (E1_MATE, "g2g4", "incorrect", ["g2g4", "d8h4"], None),
    (E1_MATE, "g2g3", "correct", None, None),
    (E1_BLACK, "c6a5", "correct", None, None),
    (E1_BLACK, "e8f7", "incorrect", ["e8f7", "c1c6", "f7e7"], (-2, -5)),
])
def test_e1_verified_fixtures(fen, uci, status, line, balances):
    exercise = safety(fen)
    original = exercise.model_dump_json()
    board = chess.Board(fen)
    assert not board.is_game_over(claim_draw=False)
    result = safety_result(exercise, uci)
    assert result.status == status and result.history == [] and result.next_hint is None
    candidate = board.copy()
    candidate.push_uci(uci)
    assert result.resulting_fen == (candidate.fen() if status == "correct" else fen)
    assert exercise.model_dump_json() == original
    fact = result.facts[0]
    if line:
        assert fact.moves == line
        for move in line:
            assert chess.Move.from_uci(move) in board.legal_moves
            board.push_uci(move)
        assert board.fen() == fact.resulting_fen
        if balances:
            assert fact.code == "material_loss"
            assert (fact.initial_balance, fact.final_balance) == balances
            assert material_balance(board, chess.Board(fen).turn) == fact.final_balance
            assert fact.loss == balances[0] - balances[1] == 3
        else:
            assert fact.code == "allows_mate" and board.is_checkmate()
            assert fact.mated_king.color == "white" and fact.mated_king.square == "e1"
    else:
        assert fact.code == "legal_destination"


@pytest.mark.parametrize("limit,status", [(0, "incorrect"), (2, "incorrect"), (3, "correct"), (4, "correct")])
def test_e1_loss_threshold(limit, status):
    assert safety_result(safety(E1_EXCHANGE, limit), "d1d5").status == status
    # Mate nunca pode ser comprado aumentando o limite de perda.
    assert safety_result(safety(E1_MATE, limit), "g2g4").status == "incorrect"


@pytest.mark.parametrize("fen,uci,code", [
    (E1_SIMPLE, "a1a3", "wrong_piece"),
    (E1_SIMPLE, "c8a8", "wrong_piece"),
    (E1_SIMPLE, "c3c4", "illegal_move"),
    (E1_SIMPLE, "e1e1", "own_piece_on_destination"),
    ("k3r3/8/8/8/8/8/4N3/4K2R w - - 0 1", "e2c3", "leaves_king_in_check"),
])
def test_e1_illegal_actions(fen, uci, code):
    result = safety_result(safety(fen), uci)
    assert result.status == "incorrect" and result.resulting_fen == fen
    assert result.facts[0].code == code


def test_e1_recovery_and_equal_exchange():
    # Controle com captura de peão, torre adversária e recaptura do bispo: +1 líquido.
    fen = "3rk3/8/8/3p4/8/8/6B1/3R2KR w - - 0 1"
    exercise = safety(fen)
    assert safety_result(exercise, "d1d5").status == "correct"
    board = chess.Board(fen)
    initial = material_balance(board, board.turn)
    for move in ["d1d5", "d8d5", "g2d5"]:
        assert chess.Move.from_uci(move) in board.legal_moves
        board.push_uci(move)
    assert material_balance(board, chess.WHITE) - initial == 1
    # Troca igual no centro; o bispo pode recuperar a torre adversária.
    fen = "3rk3/8/8/8/3R4/8/6B1/6KR w - - 0 1"
    assert safety_result(safety(fen), "d4d5").status == "correct"
    board = chess.Board(fen)
    initial = material_balance(board, chess.WHITE)
    for move in ["d4d5", "d8d5", "g2d5"]:
        assert chess.Move.from_uci(move) in board.legal_moves
        board.push_uci(move)
    assert material_balance(board, chess.WHITE) == initial



@pytest.mark.parametrize("mode", ["reverse", "shuffle"])
def test_e1_enumeration_order_independent(monkeypatch, mode):
    cases = [(E1_SIMPLE, "c3a4"), (E1_SIMPLE, "e1f2"), (E1_EXCHANGE, "d1d5"),
             (E1_MATE, "g2g4"), (E1_BLACK, "e8f7")]
    expected = [safety_result(safety(fen), uci).model_dump() for fen, uci in cases]
    original = chess.Board.generate_legal_moves
    def reordered(self, *args, **kwargs):
        moves = list(original(self, *args, **kwargs))
        if mode == "reverse":
            moves.reverse()
        else:
            random.Random(173).shuffle(moves)
        return iter(moves)
    monkeypatch.setattr(chess.Board, "generate_legal_moves", reordered)
    assert [safety_result(safety(fen), uci).model_dump() for fen, uci in cases] == expected


def test_e1_history_and_action_contract():
    from exercises.models import ExerciseClientError
    assert safety_result(safety(), "c3a4", []).history == []
    with pytest.raises(ExerciseClientError) as error:
        safety_result(safety(), "c3a4", ["c3a4"])
    assert error.value.code == "invalid_history"
    with pytest.raises(ExerciseClientError) as error:
        validate(safety(), AnswerAction(answer=True))
    assert error.value.code == "incompatible_action"


def test_e1_terminal_and_automatic_draw():
    with pytest.raises(RuntimeError, match="posição inicial não terminal"):
        safety_result(safety(E1_SIMPLE.replace("0 1", "150 1")), "c3a4")
    # O lance real dispara 75 movimentos: empate automático, sem perda.
    result = safety_result(safety(E1_SIMPLE.replace("0 1", "149 1")), "e1f2")
    assert result.status == "correct"
    assert chess.Board(result.resulting_fen).is_game_over(claim_draw=False)
    # Mate dado pelo aluno é seguro mesmo sem critério material.
    fen = "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1"
    result = safety_result(safety(fen), "f7g7")
    assert result.status == "correct" and chess.Board(result.resulting_fen).is_checkmate()


def test_e1_fools_mate_position_generated():
    board = chess.Board()
    board.push_uci("f2f3")
    board.push_uci("e7e5")
    assert board.fen() == E1_MATE
