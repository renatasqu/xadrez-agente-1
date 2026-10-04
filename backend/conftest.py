"""Configuração comum dos testes."""

import pytest

from config import settings


@pytest.fixture(autouse=True)
def log_de_guardrails_temporario(tmp_path, monkeypatch):
    """Os testes gravam o log de guardrails numa pasta temporária, não em backend/logs/."""
    monkeypatch.setattr(settings, "log_guardrails", tmp_path / "guardrails.jsonl")
