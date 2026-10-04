"""Analista de ponta a ponta com LLM e Stockfish de verdade. Rodar com: pytest -m llm"""

import pytest

from agents import analista, router

MATE_EM_1 = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"
INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

requer_stockfish = pytest.mark.skipif(
    analista.caminho_do_stockfish() is None, reason="Stockfish não instalado"
)


@pytest.mark.llm
@requer_stockfish
def test_mate_em_1_de_ponta_a_ponta():
    resposta = router.responder("Qual o melhor lance para as brancas?", fen=MATE_EM_1)
    assert resposta.agente == "analista"
    assert "Ra8#" in resposta.resposta and "mate em 1 para as brancas" in resposta.resposta
    assert resposta.fontes[0].documento == "stockfish"


@pytest.mark.llm
@requer_stockfish
def test_posicao_inicial_de_ponta_a_ponta():
    resposta = router.responder(f"O que as brancas devem jogar? {INICIAL}")
    assert resposta.agente == "analista" and "equilibrada" in resposta.resposta
