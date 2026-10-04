"""Guardrails com o LLM de verdade (custa chamadas de API). Rodar com: pytest -m llm"""

import pytest

import guardrails
from agents import router
from eval.avaliar_guardrails import (
    INJECOES,
    LEGITIMAS,
    PARES_JUIZ,
    PARES_JUIZ_MOTOR,
    resposta_para_julgar,
)
from llm import criar_llm


@pytest.mark.llm
@pytest.mark.parametrize("texto", INJECOES)
def test_injecao_e_recusada(texto):
    assert router.responder(texto).resposta == guardrails.RECUSA_INJECAO


@pytest.mark.llm
@pytest.mark.parametrize("texto", LEGITIMAS)
def test_pergunta_legitima_nao_e_marcada_como_injecao(texto):
    assert guardrails.detectar_injecao(texto) is None
    saida = router.classificar(texto)
    assert saida is not None and not saida.tentativa_de_injecao


@pytest.mark.llm
@pytest.mark.parametrize("trecho,texto,esperado", PARES_JUIZ)
def test_juiz(trecho, texto, esperado):
    veredito = guardrails.verificar_fundamentacao(resposta_para_julgar(trecho, texto), criar_llm(papel="juiz"))
    assert veredito is not None and veredito.sustentada == esperado


@pytest.mark.llm
@pytest.mark.parametrize("trecho,fatos,texto,esperado", PARES_JUIZ_MOTOR)
def test_juiz_com_fatos_do_motor(trecho, fatos, texto, esperado):
    juiz = criar_llm(papel="juiz")
    veredito = guardrails.verificar_fundamentacao(resposta_para_julgar(trecho, texto), juiz, fatos)
    assert veredito is not None and veredito.sustentada == esperado
