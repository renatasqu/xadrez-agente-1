"""Roteamento com o LLM de verdade (custa chamadas de API). Rodar com: pytest -m llm"""

import pytest

from agents import router
from eval.avaliar_roteamento import CASOS, CASOS_COM_TABULEIRO, TABULEIRO


@pytest.mark.llm
@pytest.mark.parametrize("pergunta,esperada", CASOS)
def test_roteamento(pergunta, esperada):
    assert router.classificar_pergunta(pergunta) == esperada


@pytest.mark.llm
@pytest.mark.parametrize("pergunta,esperada", CASOS_COM_TABULEIRO)
def test_roteamento_com_tabuleiro_anexado(pergunta, esperada):
    assert router.classificar_pergunta(pergunta, fen=TABULEIRO) == esperada


@pytest.mark.llm
@pytest.mark.parametrize("pergunta", ["receita de bolo de chocolate", "Como programar em Python?"])
def test_fora_do_tema_recusado_de_ponta_a_ponta(monkeypatch, pergunta):
    # Estes casos passavam do MIN_SCORE na busca; o roteador deve recusá-los antes de buscar.
    buscas = []
    monkeypatch.setattr(router, "buscar", lambda *a, **k: buscas.append(a) or [])
    resposta = router.responder(pergunta)
    assert resposta.resposta == router.RECUSA and buscas == []


@pytest.mark.llm
@pytest.mark.parametrize("fen", [None, TABULEIRO])
def test_como_funciona_o_cavalo_de_ponta_a_ponta(fen):
    # Bug: sem o tabuleiro, ia para o Professor e recebia "Não encontrei isso nos documentos".
    resposta = router.responder("Como funciona o cavalo?", fen=fen)
    assert resposta.agente == "arbitro" and resposta.fontes
