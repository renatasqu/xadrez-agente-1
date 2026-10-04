"""Configuração dos testes offline (sem API)."""

import re

import pytest

import onde_ler
from config import settings


@pytest.fixture(autouse=True)
def sem_juiz_real(request, monkeypatch):
    """Desliga o juiz de fundamentação e a chave da API: nenhuma chamada real escapa.

    Os testes marcados com `llm` (rodados com pytest -m llm) usam a API de verdade.
    """
    if request.node.get_closest_marker("llm"):
        return
    monkeypatch.setattr(settings, "verificar_fundamentacao", False)
    monkeypatch.setattr(settings, "anthropic_api_key", "")


def _palavras(texto: str) -> set[str]:
    return set(re.findall(r"\w{3,}", texto.lower()))


@pytest.fixture(autouse=True)
def frase_chave_sem_modelo(request, monkeypatch):
    """A frase-chave do "Onde ler" usa o modelo de embeddings; nos testes offline, uma versão
    por palavras em comum (rápida, sem carregar o modelo). `modelo_real` usa o modelo."""
    if request.node.get_closest_marker("modelo_real"):
        return

    def por_palavras(pergunta: str, candidatas: list[str]) -> list[float]:
        alvo = _palavras(onde_ler.expandir_pergunta(pergunta))
        return [len(alvo & _palavras(c)) for c in candidatas]

    monkeypatch.setattr(onde_ler, "similaridades", por_palavras)
