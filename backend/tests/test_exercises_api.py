"""Router isolado: não precisa inicializar o pipeline da aplicação."""

import os
import subprocess
import sys

import chess
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from exercises.api import router
from exercises.catalog import CATALOG
from exercises.models import AnswerPositionQuestionGoal, Exercise


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_get_and_validation(client):
    response = client.get("/exercises/a1-cavalo")
    assert response.status_code == 200
    assert response.json()["goal"]["type"] == "reach_legal_square"
    for destination, status in (("c3", "correct"), ("b3", "incorrect")):
        response = client.post("/exercises/a1-cavalo/validate", json={"version": 1, "action": {"type": "move", "source": "b1", "destination": destination}})
        assert response.status_code == 200
        assert response.json()["status"] == status
        assert response.json()["next_hint"] is None
        assert "hints" not in response.json()

        board = chess.Board(CATALOG["a1-cavalo"].fen)
        if status == "correct":
            board.push_uci("b1" + destination)
        assert response.json()["resulting_fen"] == board.fen()


def test_impossible_castling(client, monkeypatch):
    monkeypatch.setitem(CATALOG, "blocked", Exercise(id="blocked", prompt="Roque?", fen="4k3/8/8/8/8/8/8/4K2R w - - 0 1", goal=AnswerPositionQuestionGoal(side="kingside")))
    for answer, status in ((False, "correct"), (True, "incorrect")):
        response = client.post("/exercises/blocked/validate", json={"version": 1, "action": {"type": "answer", "answer": answer}})
        assert response.status_code == 200
        assert response.json()["status"] == status
        assert response.json()["next_hint"] is None
        assert "hints" not in response.json()
        assert response.json()["facts"] == [{"code": "castling_right_absent", "side": "kingside"}]
        assert response.json()["resulting_fen"] == CATALOG["blocked"].fen
    response = client.post("/exercises/a2-roque-bloqueado/validate", json={"version": 1, "action": {"type": "answer", "answer": False}})
    assert response.status_code == 200
    assert response.json()["status"] == "correct"
    assert response.json()["facts"] == [{"code": "path_occupied", "squares": ["f1", "g1"]}]


@pytest.mark.parametrize("id,payload,status", [
    ("missing", {"version": 1, "action": {"type": "answer", "answer": True}}, 404),
    ("a1-cavalo", {"version": 2, "action": {"type": "move", "source": "b1", "destination": "c3"}}, 409),
    ("a1-cavalo", {"version": 1, "action": {"type": "answer", "answer": True}}, 422),
    ("a1-cavalo", {"version": 1, "action": {"type": "move", "source": "b1", "destination": "c3"}, "fen": "ignored?"}, 422),
    ("a1-cavalo", {"version": 1, "action": {"type": "move", "source": "b1", "destination": "c3"}, "goal": {}}, 422),
    ("a1-cavalo", {"version": 1, "action": {"type": "move", "source": "b1", "destination": "c3"}, "history": ["b1c3", "e8e7"]}, 422),
    ("a1-cavalo", {"version": 1, "action": {"type": "move", "source": "b1", "destination": "z9"}}, 422),
])
def test_protocol_errors(client, id, payload, status):
    assert client.post(f"/exercises/{id}/validate", json=payload).status_code == status
    assert client.get("/exercises/missing").status_code == 404


def test_import_is_independent():
    script = '''import sys
import exercises.api
from exercises.models import Exercise, MoveAction, ValidationRequest
from exercises.catalog import CATALOG
for first, capture in (("b5c7", "c7a8"), ("b5d6", "d6f5")):
    partial = exercises.api.validate_exercise("a3-garfo-cavalo", ValidationRequest(
        version=1, action=MoveAction(source=first[:2], destination=first[2:])))
    assert partial.status == "partial"
    final = exercises.api.validate_exercise("a3-garfo-cavalo", ValidationRequest(
        version=1, history=partial.history, action=MoveAction(source=capture[:2], destination=capture[2:])))
    assert final.status == "correct"
negative = Exercise(id="negative", prompt="Garfo", fen="r1r1k3/8/8/1N6/8/8/8/4K2R w - - 0 1",
                    goal=CATALOG["a3-garfo-cavalo"].goal)
CATALOG[negative.id] = negative
assert exercises.api.validate_exercise("negative", ValidationRequest(
    version=1, action=MoveAction(source="b5", destination="c7"))).status == "incorrect"
for move, expected in (("c3a4", "correct"), ("c3d5", "correct"), ("e1f2", "incorrect")):
    result = exercises.api.validate_exercise("e1-material-seguro", ValidationRequest(
        version=1, action=MoveAction(source=move[:2], destination=move[2:])))
    assert result.status == expected
for name in sys.modules:
    assert not name.startswith(("llm", "retrieval", "guardrails", "langchain", "langgraph", "chromadb", "sentence_transformers", "chess.engine", "agents.analista")), name
'''
    subprocess.run([sys.executable, "-c", script], env={**os.environ, "PYTHONPATH": os.getcwd()}, check=True)


def test_router_registered_in_main():
    from main import app

    client = TestClient(app)
    assert client.get("/exercises/a1-cavalo").status_code == 200
    response = client.post("/exercises/a1-cavalo/validate", json={"version": 1, "action": {"type": "move", "source": "b1", "destination": "b3"}})
    assert response.status_code == 200
    assert response.json()["status"] == "incorrect"
    assert client.post("/exercises/a1-cavalo/validate", json={"version": 2, "action": {"type": "move", "source": "b1", "destination": "c3"}}).status_code == 409
    partial = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "action": {"type": "move", "source": "b5", "destination": "c7"},
    })
    assert partial.status_code == 200 and partial.json()["status"] == "partial"
    complete = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "history": partial.json()["history"],
        "action": {"type": "move", "source": "c7", "destination": "a8"},
    })
    assert complete.status_code == 200 and complete.json()["status"] == "correct"
    adulterated = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "history": ["b5c7", "e8d8"],
        "action": {"type": "move", "source": "c7", "destination": "a8"},
    })
    assert adulterated.status_code == 422
    assert adulterated.json() == {"code": "invalid_history", "message": "Histórico inválido: ação rejeitada ou resposta adversária não canônica"}


@pytest.mark.parametrize("exercise_id,action", [
    ("a1-cavalo", {"type": "move", "source": "b1", "destination": "c3"}),
    ("a2-roque-pequeno", {"type": "answer", "answer": True}),
    ("a2-roque-grande", {"type": "answer", "answer": True}),
    ("a2-roque-bloqueado", {"type": "answer", "answer": False}),
])
def test_a1_a2_history_compatibility(client, exercise_id, action):
    original = client.post(f"/exercises/{exercise_id}/validate", json={"version": 1, "action": action})
    empty = client.post(f"/exercises/{exercise_id}/validate", json={"version": 1, "action": action, "history": []})
    assert original.status_code == empty.status_code == 200
    assert original.json() == empty.json()
    assert original.json()["status"] == "correct" and original.json()["history"] == []
    assert client.post(f"/exercises/{exercise_id}/validate", json={
        "version": 1, "action": action, "history": ["b5c7", "e8d7"],
    }).status_code == 422


@pytest.mark.parametrize("first,capture,last", [("b5c7", "c7a8", "d7c6"), ("b5d6", "d6f5", "a8a1")])
def test_a3_two_requests_complete_stateless_sequence(client, first, capture, last):
    exercise = client.get("/exercises/a3-garfo-cavalo").json()
    assert exercise["goal"]["type"] == "knight_fork_gain"
    payload = {"version": 1, "action": {"type": "move", "source": first[:2], "destination": first[2:]}}
    response = client.post("/exercises/a3-garfo-cavalo/validate", json=payload)
    assert response.status_code == 200
    partial = response.json()
    assert partial["status"] == "partial" and partial["history"] == [first, "e8d7"]
    assert client.post("/exercises/a3-garfo-cavalo/validate", json=payload).json() == partial
    response = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "history": partial["history"],
        "action": {"type": "move", "source": capture[:2], "destination": capture[2:]},
    })
    assert response.status_code == 200
    complete = response.json()
    assert complete["status"] == "correct"
    assert complete["history"] == [first, "e8d7", capture, last]
    board = chess.Board(exercise["fen"])
    assert board.is_valid()
    for move in complete["history"]:
        assert chess.Move.from_uci(move) in board.legal_moves
        board.push_uci(move)
        assert board.is_valid()
    assert complete["resulting_fen"] == board.fen()
    assert complete["facts"][-1]["net_gain"] == 5
    assert complete["next_hint"] is None


@pytest.mark.parametrize("history", [
    ["b5c7", "e8d8"],  # Legal, porém diferente da resposta canônica.
    ["b5c7", "e8e8"], ["b5b7", "e8d7"], ["b5a3", "e8d7"], ["b5c7"],
    ["b5c7", "e8d7", "c7a8"], ["b5c7", "e8d7", "c7a8", "d7c6"],
    ["b5c7", "e8d7", "c7b5", "d7c6"], ["b5c7", "e8d7"] * 3,
    ["bad"], None,
])
def test_a3_history_errors_are_protocol_errors(client, history):
    if history == ["b5c7", "e8d8"]:
        board = chess.Board(CATALOG["a3-garfo-cavalo"].fen)
        board.push_uci(history[0])
        assert chess.Move.from_uci(history[1]) in board.legal_moves
    response = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "history": history, "action": {"type": "move", "source": "c7", "destination": "a8"},
    })
    assert response.status_code == 422
    assert "status" not in response.json()


@pytest.mark.parametrize("extra", [
    {"fen": "anything"}, {"goal": {}}, {"min_material_gain": 1}, {"opponent_policy": "cooperative"},
    {"opponent_reply": "e8d8"}, {"max_student_moves": 3},
])
def test_a3_post_cannot_override_catalog_or_defense(client, extra):
    response = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "action": {"type": "move", "source": "b5", "destination": "c7"}, **extra,
    })
    assert response.status_code == 422


def test_a3_wrong_action_version_and_incomplete_request(client):
    assert client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 2, "action": {"type": "move", "source": "b5", "destination": "c7"},
    }).status_code == 409
    assert client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "action": {"type": "answer", "answer": True},
    }).status_code == 422
    assert client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "history": ["b5c7", "e8d7"],
    }).status_code == 422


def test_a3_negative_fixture_only_in_tests(client, monkeypatch):
    assert "negative-fork" not in CATALOG
    exercise = Exercise(id="negative-fork", prompt="Garfo",
                        fen="r1r1k3/8/8/1N6/8/8/8/4K2R w - - 0 1", goal=CATALOG["a3-garfo-cavalo"].goal)
    monkeypatch.setitem(CATALOG, exercise.id, exercise)
    for destination, reason in (("c7", "attacker_lost"), ("d6", "insufficient_gain")):
        response = client.post(f"/exercises/{exercise.id}/validate", json={
            "version": 1, "action": {"type": "move", "source": "b5", "destination": destination},
        })
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "incorrect"
        assert result["history"] == [] and result["resulting_fen"] == exercise.fen
        assert result["facts"][-1]["reason"] == reason
    assert client.post(f"/exercises/{exercise.id}/validate", json={
        "version": 1, "history": ["b5c7", "c8c7"],
        "action": {"type": "move", "source": "c7", "destination": "a8"},
    }).status_code == 422


def test_a3_rejected_second_action_keeps_previous_history(client):
    partial = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "action": {"type": "move", "source": "b5", "destination": "c7"},
    }).json()
    rejected = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "history": partial["history"],
        "action": {"type": "move", "source": "c7", "destination": "b5"},
    })
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "incorrect"
    assert rejected.json()["history"] == partial["history"]
    assert rejected.json()["resulting_fen"] == partial["resulting_fen"]


@pytest.mark.parametrize("integrated", [False, True])
@pytest.mark.parametrize("exercise_id,payload,expected_status,code", [
    ("absent", {"version": 1, "action": {"type": "answer", "answer": True}}, 404, "exercise_not_found"),
    ("a3-garfo-cavalo", {"version": 2, "action": {"type": "move", "source": "b5", "destination": "c7"}}, 409, "version_mismatch"),
    ("a3-garfo-cavalo", {"version": 1, "history": ["b5c7", "e8d8"], "action": {"type": "move", "source": "c7", "destination": "a8"}}, 422, "invalid_history"),
    ("a3-garfo-cavalo", {"version": 1, "history": ["a1a1", "e8d7"], "action": {"type": "move", "source": "c7", "destination": "a8"}}, 422, "invalid_history"),
    ("a3-garfo-cavalo", {"version": 1, "history": ["b5c7q", "e8d7"], "action": {"type": "move", "source": "c7", "destination": "a8"}}, 422, "invalid_history"),
    ("a3-garfo-cavalo", {"version": 1, "history": ["b5c7", "e8d7q"], "action": {"type": "move", "source": "c7", "destination": "a8"}}, 422, "invalid_history"),
    ("a3-garfo-cavalo", {"version": 1, "action": {"type": "move", "source": "z5", "destination": "c7"}}, 422, "invalid_action"),
    ("a3-garfo-cavalo", {"version": 1}, 422, "invalid_action"),
    ("a3-garfo-cavalo", {"version": 1, "action": {"type": "answer", "answer": True}}, 422, "incompatible_action"),
    ("a3-garfo-cavalo", {"version": "bad", "action": {"type": "move", "source": "b5", "destination": "c7"}}, 422, "invalid_request"),
    ("a3-garfo-cavalo", {"version": 1, "goal": {}, "action": {"type": "move", "source": "b5", "destination": "c7"}}, 422, "invalid_request"),
])
def test_operational_errors_have_own_contract(client, integrated, exercise_id, payload, expected_status, code):
    if integrated:
        from main import app
        client = TestClient(app)
    response = client.post(f"/exercises/{exercise_id}/validate", json=payload)
    assert response.status_code == expected_status
    assert set(response.json()) == {"code", "message"}
    assert response.json()["code"] == code
    assert isinstance(response.json()["message"], str)


@pytest.mark.parametrize("kind", ["value_error", "fact_error"])
def test_unexpected_errors_are_internal_not_client_errors(monkeypatch, kind):
    import exercises.api as exercise_api
    from exercises.models import ExerciseClientError, MaterialGainFact, MoveAction, ValidationRequest
    from main import app

    def fail(*args, **kwargs):
        if kind == "value_error":
            raise ValueError("detalhe privado do bug")
        return MaterialGainFact(initial_balance=0, final_balance=3, net_gain=999, required_gain=3, fen="unused")

    monkeypatch.setattr(exercise_api, "validate", fail)
    request = ValidationRequest(version=1, action=MoveAction(source="b5", destination="c7"))
    with pytest.raises(ValueError) as error:
        exercise_api.validate_exercise("a3-garfo-cavalo", request)
    assert not isinstance(error.value, ExerciseClientError)
    response = TestClient(app, raise_server_exceptions=False).post("/exercises/a3-garfo-cavalo/validate", json=request.model_dump())
    assert response.status_code == 500
    assert response.json() == {"code": "internal_error", "message": "Erro interno ao processar o exercício"}


def test_terminal_initial_exercise_is_blocked_at_resolution(monkeypatch):
    from exercises.api import get_exercise
    from main import app

    fen = "r3k3/2r5/8/1N3r2/8/8/8/4K2R w - - 150 1"
    board = chess.Board(fen)
    assert board.is_valid() and board.is_game_over(claim_draw=False)
    assert chess.Move.from_uci("b5c7") in board.legal_moves and board.is_capture(chess.Move.from_uci("b5c7"))
    exercise = Exercise(id="ended", prompt="Garfo", fen=fen, goal=CATALOG["a3-garfo-cavalo"].goal)
    monkeypatch.setitem(CATALOG, exercise.id, exercise)
    with pytest.raises(RuntimeError, match="posição inicial não terminal"):
        get_exercise(exercise.id)
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/exercises/ended").status_code == 500
    response = client.post("/exercises/ended/validate", json={
        "version": 1, "action": {"type": "move", "source": "b5", "destination": "c7"},
    })
    assert response.status_code == 500 and response.json()["code"] == "internal_error"


def test_namespace_error_handlers_preserve_legacy_routes_and_boundaries(monkeypatch):
    import exercises.api as exercise_api
    from main import app

    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/exercises/unknown/path").json()["code"] == "exercise_not_found"
    method = client.delete("/exercises/a3-garfo-cavalo")
    assert method.status_code == 405 and set(method.json()) == {"code", "message"}
    assert "allow" in method.headers
    for response in [client.get("/exercises-other"), client.post("/chat", json={})]:
        assert "resposta" in response.json() and "code" not in response.json()
    monkeypatch.setattr(exercise_api, "validate", lambda *args, **kwargs: {"broken": True})
    malformed_result = client.post("/exercises/a3-garfo-cavalo/validate", json={
        "version": 1, "action": {"type": "move", "source": "b5", "destination": "c7"},
    })
    assert malformed_result.status_code == 500 and malformed_result.json()["code"] == "internal_error"


def test_error_contract_is_declared_in_openapi(client):
    document = client.get("/openapi.json").json()
    responses = document["paths"]["/exercises/{exercise_id}/validate"]["post"]["responses"]
    for status in ["404", "409", "422", "500"]:
        assert responses[status]["content"]["application/json"]["schema"]["$ref"].endswith("/ExerciseError")


@pytest.mark.parametrize("integrated", [False, True])
@pytest.mark.parametrize("history", [None, []])
def test_e1_api_correct(client, integrated, history):
    if integrated:
        from main import app
        client = TestClient(app)
    exercise = client.get("/exercises/e1-material-seguro").json()
    assert exercise["goal"]["type"] == "avoid_material_loss"
    payload = {"version": 1, "action": {"type": "move", "source": "c3", "destination": "a4"}}
    if history is not None:
        payload["history"] = history
    response = client.post("/exercises/e1-material-seguro/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    board = chess.Board(exercise["fen"])
    board.push_uci("c3a4")
    assert data == {"status": "correct", "resulting_fen": board.fen(), "history": [],
                    "facts": [{"code": "legal_destination", "source": "c3", "destination": "a4"}], "next_hint": None}


@pytest.mark.parametrize("integrated", [False, True])
@pytest.mark.parametrize("extra,code", [
    ({"history": ["c3a4"]}, "invalid_history"),
    ({"action": {"type": "answer", "answer": True}}, "incompatible_action"),
    ({"action": {"type": "move", "source": "z1", "destination": "a4"}}, "invalid_action"),
    ({"unknown": True}, "invalid_request"),
])
def test_e1_api_operational_errors(client, integrated, extra, code):
    if integrated:
        from main import app
        client = TestClient(app)
    response = client.post("/exercises/e1-material-seguro/validate", json={
        "version": 1, "action": {"type": "move", "source": "c3", "destination": "a4"}, **extra})
    assert response.status_code == 422
    assert set(response.json()) == {"code", "message"} and response.json()["code"] == code


def test_e1_api_pedagogical_errors_are_200(client):
    for source, destination, code in [("e1", "f2", "material_loss"), ("c3", "c4", "illegal_move")]:
        response = client.post("/exercises/e1-material-seguro/validate", json={
            "version": 1, "action": {"type": "move", "source": source, "destination": destination}})
        assert response.status_code == 200 and response.json()["status"] == "incorrect"
        assert response.json()["facts"][0]["code"] == code
        assert response.json()["resulting_fen"] == CATALOG["e1-material-seguro"].fen


def test_e1_terminal_configuration_returns_internal_error(monkeypatch):
    from exercises.api import get_exercise
    from main import app
    original = CATALOG["e1-material-seguro"]
    ended = Exercise(**{**original.model_dump(), "fen": original.fen.replace("0 1", "150 1")})
    monkeypatch.setitem(CATALOG, original.id, ended)
    with pytest.raises(RuntimeError, match="posição inicial não terminal"):
        get_exercise(original.id)
    client = TestClient(app, raise_server_exceptions=False)
    for response in [client.get(f"/exercises/{original.id}"),
                     client.post(f"/exercises/{original.id}/validate", json={"version": 1,
                                 "action": {"type": "move", "source": "c3", "destination": "a4"}})]:
        assert response.status_code == 500 and response.json()["code"] == "internal_error"


@pytest.fixture(autouse=True)
def authenticated_adapter(monkeypatch, tmp_path):
    """Isola testes de protocolo; sessões reais são cobertas em test_authorization."""
    from auth import require_user
    import main
    import progresso
    from config import settings
    monkeypatch.setattr(settings, "db_progresso", tmp_path / "progress.sqlite")
    progresso.criar_tabelas()
    main.app.dependency_overrides[require_user] = lambda: {"name": "Test", "email": "test@example.com"}
    original = FastAPI.include_router
    def include(app, *args, **kwargs):
        app.dependency_overrides[require_user] = lambda: {"name": "Test", "email": "test@example.com"}
        return original(app, *args, **kwargs)
    monkeypatch.setattr(FastAPI, "include_router", include)
    yield
    main.app.dependency_overrides.pop(require_user, None)
