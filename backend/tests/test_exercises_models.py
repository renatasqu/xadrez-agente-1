"""Contratos rejeitam campos e coerções que mudariam o significado da tentativa."""

import pytest
from pydantic import TypeAdapter, ValidationError

from agents.demonstracoes import DEMONSTRACOES
from exercises.catalog import CATALOG, demonstration_position
from exercises.models import (
    Exercise, Fact, ForkFact, Hint, KnightForkGainGoal, MaterialGainFact, OpponentReplyFact, PieceRef, RefutationLineFact,
    ReachLegalSquareGoal, ValidationRequest, ValidationResult,
)


@pytest.mark.parametrize("payload", [
    {"version": 1, "action": {"type": "answer", "answer": "false"}},
    {"version": True, "action": {"type": "answer", "answer": False}},
    {"version": 1, "action": {"type": "move", "source": "z1", "destination": "c3"}},
    {"version": 1, "action": {"type": "move", "source": "b1"}},
    {"version": 1, "action": {"type": "answer", "answer": False}, "history": ["not-uci"]},
    {"version": 1, "action": {"type": "answer", "answer": False, "fen": "anything"}},
])
def test_malformed_contract(payload):
    with pytest.raises(ValidationError):
        ValidationRequest.model_validate(payload)


def test_discriminated_facts():
    result = ValidationResult.model_validate({"status": "incorrect", "resulting_fen": CATALOG["a1-cavalo"].fen, "facts": [{"code": "castling_right_absent", "side": "kingside"}]})
    assert result.facts[0].side == "kingside"
    for payload in ({"code": "king_already_moved"}, {"code": "king_in_check", "square": "e1", "side": "kingside"}):
        with pytest.raises(ValidationError):
            TypeAdapter(Fact).validate_python(payload)


def test_catalog_positions_and_roundtrip():
    for id, theme in (("a1-cavalo", "cavalo"), ("a2-roque-pequeno", "roque"), ("a2-roque-grande", "roque_grande"), ("a2-roque-bloqueado", "notacao")):
        exercise = CATALOG[id]
        assert exercise.fen == demonstration_position(theme) == DEMONSTRACOES[theme].fen_inicial
        assert Exercise.model_validate_json(exercise.model_dump_json()) == exercise


def test_invalid_position_and_piece():
    original = CATALOG["a1-cavalo"].model_dump()
    for fen in ("invalid", "8/8/8/8/8/8/8/8 w - - 0 1", "4k3/8/8/8/8/8/8/4K3 w - - 0 1"):
        with pytest.raises(ValidationError):
            Exercise.model_validate({**original, "fen": fen})


@pytest.mark.parametrize("payload", [
    {"code": "path_occupied", "squares": []},
    {"code": "path_occupied", "squares": ["f1", "f1"]},
    {"code": "legal_destination", "source": "b1", "destination": "b1"},
    {"code": "straight_knight_move", "source": "b1", "destination": "b1"},
    {"code": "straight_knight_move", "source": "b1", "destination": "c3"},
])
def test_fact_local_invariants(payload):
    with pytest.raises(ValidationError):
        TypeAdapter(Fact).validate_python(payload)


@pytest.mark.parametrize("destination", ["b3", "d1"])
def test_straight_fact_accepts_rank_or_file(destination):
    fact = TypeAdapter(Fact).validate_python({"code": "straight_knight_move", "source": "b1", "destination": destination})
    assert fact.destination == destination


def test_result_contract():
    with pytest.raises(ValidationError):
        ValidationResult(status="correct")
    result = ValidationResult(status="correct", resulting_fen=CATALOG["a1-cavalo"].fen)
    assert result.next_hint is None
    assert "hints" not in result.model_dump()
    for field in ("hints", "error_class"):
        with pytest.raises(ValidationError):
            ValidationResult.model_validate({**result.model_dump(), field: []})


@pytest.mark.parametrize("level,code,squares", [
    (1, "conceptual", []),
    (2, "piece_or_region", ["b1"]),
    (3, "specific_squares", ["a3", "c3"]),
])
def test_hint_contract(level, code, squares):
    hint = Hint(level=level, code=code, highlight_squares=squares)
    assert hint.text is None
    result = ValidationResult(status="incorrect", resulting_fen=CATALOG["a1-cavalo"].fen, next_hint=hint)
    assert ValidationResult.model_validate_json(result.model_dump_json()) == result


@pytest.mark.parametrize("payload", [
    {"level": 1, "code": "unknown"},
    {"level": 4, "code": "conceptual"},
    {"level": 1, "code": "specific_squares"},
    {"level": 2, "code": "piece_or_region", "highlight_squares": []},
    {"level": 3, "code": "specific_squares", "highlight_squares": ["z9"]},
    {"level": 3, "code": "specific_squares", "highlight_squares": ["a3", "a3"]},
])
def test_hint_rejects_invalid_payload(payload):
    with pytest.raises(ValidationError):
        Hint.model_validate(payload)


def test_history_defaults_are_independent():
    payload = {"version": 1, "action": {"type": "answer", "answer": False}}
    first, second = ValidationRequest.model_validate(payload), ValidationRequest.model_validate(payload)
    first.history.append("b5c7")
    assert second.history == []
    results = [ValidationResult(status="partial", resulting_fen=CATALOG["a3-garfo-cavalo"].fen) for _ in range(2)]
    results[0].history.append("b5c7")
    assert results[1].history == []
    assert ValidationRequest.model_validate({**payload, "history": []}).history == []


@pytest.mark.parametrize("history", [None, "b5c7", [123], ["0000"], ["b5z7"], ["b5c7"] * 5])
def test_history_schema_rejects_invalid_values(history):
    with pytest.raises(ValidationError):
        ValidationRequest.model_validate({"version": 1, "action": {"type": "move", "source": "b5", "destination": "c7"}, "history": history})


def test_a3_catalog_contract_has_no_answer_line():
    exercise = CATALOG["a3-garfo-cavalo"]
    assert Exercise.model_validate_json(exercise.model_dump_json()) == exercise
    assert exercise.goal.model_dump() == {
        "type": "knight_fork_gain", "piece": {"square": "b5", "piece": "knight", "color": "white"},
        "min_material_gain": 3, "max_student_moves": 2, "opponent_policy": "material_minimax_v1",
    }


@pytest.mark.parametrize("change", [
    {"min_material_gain": 0}, {"min_material_gain": True}, {"min_material_gain": "3"},
    {"max_student_moves": 3}, {"max_student_moves": 2.0}, {"max_student_moves": "2"},
    {"opponent_policy": "stockfish"}, {"piece": {"square": "h1", "piece": "rook", "color": "white"}},
])
def test_a3_goal_is_narrow(change):
    with pytest.raises(ValidationError):
        KnightForkGainGoal.model_validate({**CATALOG["a3-garfo-cavalo"].goal.model_dump(), **change})


def test_expanded_piece_ref_does_not_widen_a1():
    with pytest.raises(ValidationError):
        ReachLegalSquareGoal(piece=PieceRef(square="h1", piece="rook", color="white"))


def fork_payload():
    return {
        "code": "fork", "attacker": {"square": "c7", "piece": "knight", "color": "white"}, "square": "c7",
        "targets": [{"square": "a8", "piece": "rook", "color": "black"},
                    {"square": "e8", "piece": "king", "color": "black"}],
        "gives_check": True, "fen": "r3k3/2N5/8/5r2/8/8/8/4K2R b - - 1 1",
    }


@pytest.mark.parametrize("targets", [
    [{"square": "a8", "piece": "rook", "color": "black"}],
    [{"square": "a8", "piece": "rook", "color": "black"}] * 2,
    [{"square": "e8", "piece": "king", "color": "black"}, {"square": "a8", "piece": "rook", "color": "black"}],
    [{"square": "a8", "piece": "pawn", "color": "black"}, {"square": "e8", "piece": "king", "color": "black"}],
    [{"square": "a8", "piece": "rook", "color": "white"}, {"square": "e8", "piece": "king", "color": "black"}],
])
def test_fork_targets_contract(targets):
    with pytest.raises(ValidationError):
        ForkFact.model_validate({**fork_payload(), "targets": targets})


@pytest.mark.parametrize("change", [
    {"square": "d6"}, {"attacker": {"square": "c7", "piece": "rook", "color": "white"}},
    {"gives_check": "true"},
])
def test_fork_attacker_contract(change):
    with pytest.raises(ValidationError):
        ForkFact.model_validate({**fork_payload(), **change})


def test_new_fact_variants_roundtrip_and_material_invariant():
    payloads = [fork_payload(), {"code": "opponent_reply", "move": "e8d7", "policy": "material_minimax_v1"},
                {"code": "material_gain", "initial_balance": -2, "final_balance": 3, "net_gain": 5,
                 "required_gain": 3, "fen": "N7/8/2k5/5r2/8/8/8/4K2R w - - 1 3"},
                {"code": "refutation_line", "reason": "attacker_lost", "moves": ["b5c7", "c8c7"],
                 "resulting_fen": "r3k3/2r5/8/8/8/8/8/4K2R w - - 0 2", "net_gain": -3, "required_gain": 3}]
    for payload in payloads:
        fact = TypeAdapter(Fact).validate_python(payload)
        assert TypeAdapter(Fact).validate_json(fact.model_dump_json()) == fact
    with pytest.raises(ValidationError):
        MaterialGainFact.model_validate({**payloads[2], "net_gain": 500})


@pytest.mark.parametrize("move", ["a1a1", "a1a1q", "bad", "e7e8x", "e7e8qq", "0000", "B5C7"])
def test_fact_uci_requires_chess_syntax(move):
    with pytest.raises(ValidationError):
        OpponentReplyFact(move=move)
    with pytest.raises(ValidationError):
        RefutationLineFact(reason="no_fork", moves=[move], resulting_fen=CATALOG["a3-garfo-cavalo"].fen,
                           net_gain=0, required_gain=3)


def test_uci_syntax_does_not_require_a_board():
    assert OpponentReplyFact(move="a7a8q").move == "a7a8q"


@pytest.mark.parametrize("moves,required", [([], 3), (["b5c7"] * 5, 3), (["b5c7"], 0), (["b5c7"], -1)])
def test_refutation_bounds_and_positive_threshold(moves, required):
    with pytest.raises(ValidationError):
        RefutationLineFact(reason="no_fork", moves=moves, resulting_fen=CATALOG["a3-garfo-cavalo"].fen,
                           net_gain=0, required_gain=required)


@pytest.mark.parametrize("required", [0, -1, True])
def test_material_gain_requires_positive_strict_threshold(required):
    with pytest.raises(ValidationError):
        MaterialGainFact(initial_balance=-2, final_balance=3, net_gain=5, required_gain=required,
                         fen=CATALOG["a3-garfo-cavalo"].fen)



def test_e1_schema_roundtrip():
    from exercises.models import AvoidMaterialLossGoal, AllowsMateFact, IllegalMoveFact, MaterialLossFact
    goal = AvoidMaterialLossGoal()
    assert goal.max_material_loss == 0 and goal.horizon_plies == 3
    assert Exercise.model_validate_json(CATALOG["e1-material-seguro"].model_dump_json()) == CATALOG["e1-material-seguro"]
    facts = [IllegalMoveFact(source="c3", destination="c4"),
             MaterialLossFact(initial_balance=-2, final_balance=-5, loss=3, max_material_loss=0,
                              moves=["e1f2", "c8c3", "f2e1"], resulting_fen="producer-owned"),
             AllowsMateFact(mated_king=PieceRef(square="e1", piece="king", color="white"),
                            moves=["g2g4", "d8h4"], resulting_fen="producer-owned")]
    for fact in facts:
        assert TypeAdapter(Fact).validate_json(fact.model_dump_json()) == fact


@pytest.mark.parametrize("fields", [
    {"max_material_loss": -1}, {"max_material_loss": True}, {"max_material_loss": "0"},
    {"horizon_plies": 4}, {"horizon_plies": 3.0}, {"horizon_plies": True},
    {"opponent_policy": "material_minimax_v1"}, {"piece": {}},
])
def test_e1_goal_rejects_invalid_configuration(fields):
    from exercises.models import AvoidMaterialLossGoal
    with pytest.raises(ValidationError):
        AvoidMaterialLossGoal(**fields)


@pytest.mark.parametrize("fields", [
    {"loss": 2}, {"loss": True}, {"max_material_loss": 3}, {"max_material_loss": -1},
    {"moves": []}, {"moves": ["a1a1"]}, {"moves": ["bad"]},
    {"moves": ["a1a2"] * 4}, {"initial_balance": "-2"},
])
def test_e1_loss_fact_invariants(fields):
    from exercises.models import MaterialLossFact
    payload = dict(initial_balance=-2, final_balance=-5, loss=3, max_material_loss=0,
                   moves=["e1f2", "c8c3", "f2e1"], resulting_fen="producer-owned")
    with pytest.raises(ValidationError):
        MaterialLossFact(**{**payload, **fields})


@pytest.mark.parametrize("fields", [
    {"mated_king": {"square": "e1", "piece": "knight", "color": "white"}},
    {"mate_in_opponent_moves": True}, {"mate_in_opponent_moves": 2},
    {"moves": []}, {"moves": ["0000"]},
])
def test_e1_mate_fact_invariants(fields):
    from exercises.models import AllowsMateFact
    payload = dict(mated_king=PieceRef(square="e1", piece="king", color="white"),
                   moves=["g2g4", "d8h4"], resulting_fen="producer-owned")
    with pytest.raises(ValidationError):
        AllowsMateFact(**{**payload, **fields})


def test_e1_requires_fully_valid_board():
    from exercises.models import AvoidMaterialLossGoal
    with pytest.raises(ValidationError):
        Exercise(id="invalid-e1", prompt="Material", fen="4k3/8/8/8/8/8/8/4K2R w Q - 0 1",
                 goal=AvoidMaterialLossGoal())
