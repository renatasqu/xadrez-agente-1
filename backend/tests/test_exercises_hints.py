"""Ciclo de dicas stateless, independente do pipeline e de LLM."""
import chess
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from exercises.api import router
from exercises.catalog import CATALOG
from exercises.models import Exercise


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def action(uci):
    return {"type": "move", "source": uci[:2], "destination": uci[2:]}


def attempt(client, id, last_action, history=None):
    response = client.post(f"/exercises/{id}/validate", json={"version": 1, "action": last_action, "history": history or []})
    assert response.status_code == 200
    return response.json()


def hint(client, id, last_action=None, history=None, level=0):
    response = client.post(f"/exercises/{id}/hint", json={"version": 1, "last_action": last_action,
                           "history": history or [], "current_hint_level": level})
    assert response.status_code == 200, response.text
    return response.json()["next_hint"]


def test_a1_cycle(client):
    error = attempt(client, "a1-cavalo", action("b1b3"))
    assert error["facts"][0]["code"] == "straight_knight_move"
    assert error["next_hint"] is None
    hints = [hint(client, "a1-cavalo", action("b1b3"), level=n) for n in range(3)]
    assert [h["level"] for h in hints] == [1, 2, 3]
    assert hints[0]["text"] == "O cavalo não se move em linha reta."
    assert hints[0]["highlight_squares"] == []
    assert hints[1]["highlight_squares"] == ["b1"]
    board = chess.Board(CATALOG["a1-cavalo"].fen)
    assert set(hints[2]["highlight_squares"]) == {chess.square_name(m.to_square) for m in board.legal_moves if m.from_square == chess.B1}
    assert hint(client, "a1-cavalo", action("b1b3"), level=3) is None
    assert error["resulting_fen"] == CATALOG["a1-cavalo"].fen
    assert attempt(client, "a1-cavalo", action("b1c3"))["status"] == "correct"


@pytest.mark.parametrize("id,wrong", [("a2-roque-pequeno", False), ("a2-roque-grande", False), ("a2-roque-bloqueado", True)])
def test_a2_cycle(client, id, wrong):
    last = {"type": "answer", "answer": wrong}
    assert attempt(client, id, last)["status"] == "incorrect"
    for level in range(3):
        result = hint(client, id, last, level=level)
        assert result["level"] == level + 1
        assert "SIM" not in result["text"] and "NÃO" not in result["text"]
    assert attempt(client, id, {"type": "answer", "answer": not wrong})["status"] == "correct"


def test_a3_sequence(client):
    id = "a3-garfo-cavalo"
    assert hint(client, id)["level"] == 1
    partial = attempt(client, id, action("b5c7"))
    assert partial["status"] == "partial" and partial["next_hint"] is None
    for level in range(3):
        result = hint(client, id, history=partial["history"], level=level)
        assert result["level"] == level + 1
    assert "a8" in result["highlight_squares"]
    error = attempt(client, id, action("c7c6"), partial["history"])
    assert error["status"] == "incorrect" and error["history"] == partial["history"]
    assert error["resulting_fen"] == partial["resulting_fen"]
    assert hint(client, id, action("c7c6"), partial["history"])["text"] == "O cavalo não se move em linha reta."
    assert attempt(client, id, action("c7a8"), partial["history"])["status"] == "correct"


@pytest.mark.parametrize("fen,wrong,safe,code", [
    (CATALOG["e1-material-seguro"].fen, "e1f2", "c3a4", "material_loss"),
    ("rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2", "g2g4", "g2g3", "allows_mate"),
])
def test_e1_cycle(client, monkeypatch, fen, wrong, safe, code):
    id = "e1-fixture"
    monkeypatch.setitem(CATALOG, id, Exercise(id=id, prompt="Segurança", fen=fen, goal=CATALOG["e1-material-seguro"].goal))
    error = attempt(client, id, action(wrong))
    assert error["facts"][0]["code"] == code and error["resulting_fen"] == fen
    hints = [hint(client, id, action(wrong), level=n) for n in range(3)]
    assert "mate" in hints[0]["text"] if code == "allows_mate" else "captura" in hints[0]["text"]
    assert hints[1]["highlight_squares"]
    squares = hints[2]["highlight_squares"]
    assert attempt(client, id, action("".join(squares)))["status"] == "correct"
    assert attempt(client, id, action(safe))["status"] == "correct"


@pytest.mark.parametrize("changes,status", [
    ({"current_hint_level": -1}, 422), ({"current_hint_level": 4}, 422),
    ({"current_hint_level": True}, 422), ({"current_hint_level": "1"}, 422),
    ({"version": 2}, 409), ({"highlight_squares": ["a1"]}, 422),
    ({"text": "Resposta"}, 422), ({"diagnosis": "straight_knight_move"}, 422),
    ({"history": ["b1c3", "e8e7"]}, 422),
    ({"last_action": {"type": "answer", "answer": True}}, 422),
    ({"last_action": action("b1c3")}, 422),
])
def test_invalid_context(client, changes, status):
    payload = {"version": 1, "history": [], "last_action": action("b1b3"), "current_hint_level": 0, **changes}
    response = client.post("/exercises/a1-cavalo/hint", json=payload)
    assert response.status_code == status
    assert "next_hint" not in response.json()


def test_a3_rejects_noncanonical_history_even_when_hints_exhausted(client):
    response = client.post("/exercises/a3-garfo-cavalo/hint", json={"version": 1, "history": ["b5c7", "e8e7"], "current_hint_level": 3})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_history"
