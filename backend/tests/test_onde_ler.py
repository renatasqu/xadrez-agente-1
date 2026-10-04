"""Bloco "Onde ler": ordem pela busca (não pelo LLM) e frase-chave escolhida pelo código."""

import pytest

import agents.base as base
import agents.router as router
import guardrails
import onde_ler
from agents import arbitro
from retrieval import Trecho
from schemas import RespostaLLM, Verificacao
from tests.test_agentes import LLMFalso

ROQUE = (
    "3.8.2 by 'castling'. This is a move of the king and either rook of the same colour along "
    "the player's first rank, counting as a single move of the king and executed as follows: "
    "the king is transferred from its original square two squares towards the rook on its "
    "original square, then that rook is transferred to the square the king has just crossed."
)


def trecho(chunk_id: str, score: float, texto: str = ROQUE, documento="Laws_of_Chess-2023.pdf") -> Trecho:
    return Trecho(
        texto=texto, documento=documento, titulo="FIDE Laws of Chess (FIDE, 2023)",
        pagina=1, local=f"p. 1, § {chunk_id}", chunk_id=chunk_id, score=score,
    )


def test_ordem_vem_do_score_da_busca():
    escolhidos = onde_ler.escolher_trechos([trecho("b", 0.80), trecho("a", 0.83), trecho("c", 0.82)])
    assert [t.chunk_id for t in escolhidos] == ["a", "c", "b"]


def test_no_maximo_tres_e_so_perto_do_melhor():
    trechos = [trecho(str(i), 0.85 - i * 0.005) for i in range(6)] + [trecho("longe", 0.70)]
    escolhidos = onde_ler.escolher_trechos(trechos)
    assert len(escolhidos) == 3 and "longe" not in [t.chunk_id for t in escolhidos]
    assert [t.chunk_id for t in onde_ler.escolher_trechos([trecho("x", 0.85), trecho("y", 0.80)])] == ["x"]


def test_trechos_repetidos_aparecem_uma_vez():
    assert len(onde_ler.escolher_trechos([trecho("a", 0.8), trecho("a", 0.8)])) == 1


def test_frase_destacada_e_parte_exata_do_trecho():
    frase = onde_ler.frase_chave("Como funciona o roque?", ROQUE)
    assert frase in ROQUE and frase.startswith("This is a move of the king")


def test_frases_nao_quebram_no_numero_do_artigo():
    texto = "3.8.2 by 'castling' the king makes a special move. Then the rook jumps over the king."
    assert onde_ler.frases(texto) == [
        "3.8.2 by 'castling' the king makes a special move.", "Then the rook jumps over the king."
    ]


def test_frase_pode_atravessar_quebra_de_linha():
    texto = "Castling is a move of the king\nand a rook, counting as one move.\n\nNext paragraph here with words."
    assert onde_ler.frases(texto)[0] == "Castling is a move of the king\nand a rook, counting as one move."


@pytest.mark.parametrize(
    "lixo",
    [
        "Morgado,J - Szmetan,J [C42] Buenos Aires 1990",
        "10.exd5 exd5 11.Nxd5 Qe6? 12.Nc7+ and white wins",
        "(c) 1949 BY OLGA CAPABLANCA all rights reserved",
        "e2e4 e7e5 2.Ng1f3 Ng8f6 3.Nf3xe5 d7d6 in long notation",
        "NEW YORK HARCOURT, BRACE & WORLD, INC. PUBLISHERS",
        "Produced by Suzanne and the Online Distributed Proofreading Team",
        "Heading one\nHeading two\n" + "Another heading without any punctuation at all " * 10,
    ],
)
def test_lances_cabecalhos_e_copyright_nao_viram_destaque(lixo):
    assert onde_ler.frases(lixo) == []


def test_trecho_sem_frases_nao_destaca_nada():
    assert onde_ler.frase_chave("roque", "No. 12.\nBLACK.") == ""


def test_trecho_sem_frase_legivel_nao_e_recomendado():
    so_lances = trecho("lances", 0.84, texto="1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7")
    itens = onde_ler.recomendar("roque", [so_lances, trecho("bom", 0.83)])
    assert [i.chunk_id for i in itens] == ["bom"]


def test_recomendacao_tem_titulo_autor_e_local():
    [item] = onde_ler.recomendar("Como funciona o roque?", [trecho("3.8.2", 0.83)])
    assert item.autor == "FIDE" and item.titulo.startswith("FIDE Laws")
    assert item.local == "p. 1, § 3.8.2" and item.chunk_id == "3.8.2" and item.score == 0.83


@pytest.fixture
def busca_com_tres_trechos(monkeypatch):
    trechos = [trecho("baixo", 0.82), trecho("alto", 0.84), trecho("medio", 0.83)]
    monkeypatch.setattr(base, "buscar", lambda indice, pergunta: trechos)
    monkeypatch.setattr(router, "buscar", lambda indice, pergunta: trechos)
    return trechos


def test_resposta_do_agente_traz_onde_ler_pela_busca(busca_com_tres_trechos):
    # O LLM citou só o trecho de score mais baixo (id 1 = "baixo"); o "Onde ler" segue a busca.
    llm = LLMFalso(RespostaLLM(resposta="O rei anda duas casas.", trechos_usados=[1], confianca=0.9))
    resposta = arbitro.responder("Como funciona o roque?", llm=llm)
    assert [f.local for f in resposta.fontes] == ["p. 1, § baixo"]
    assert [t.chunk_id for t in resposta.onde_ler] == ["alto", "medio", "baixo"]


def test_nao_encontrei_nao_tem_onde_ler(busca_com_tres_trechos):
    llm = LLMFalso(RespostaLLM(resposta=base.NAO_ENCONTREI, trechos_usados=[], confianca=0))
    assert arbitro.responder("Como funciona o roque?", llm=llm).onde_ler == []


@pytest.mark.parametrize("veredito,tem_onde_ler", [("sim", True), ("parcial", True), ("nao", False)])
def test_juiz_mantem_ou_tira_o_onde_ler(busca_com_tres_trechos, veredito, tem_onde_ler):
    llm = LLMFalso(RespostaLLM(resposta="O rei anda duas casas.", trechos_usados=[1], confianca=0.9))
    resposta = arbitro.responder("Como funciona o roque?", llm=llm)
    julgada = guardrails.aplicar_verificacao(resposta, Verificacao(motivo="t", sustentada=veredito))
    assert bool(julgada.onde_ler) is tem_onde_ler


@pytest.mark.modelo_real
def test_frase_chave_com_o_modelo_de_embeddings():
    texto = (
        "The pieces are placed on the chessboard at the start of the game. "
        "Castling is a move of the king and a rook, counting as a single move of the king. "
        "The game is drawn when the position is repeated three times."
    )
    assert onde_ler.frase_chave("Como funciona o roque?", texto).startswith("Castling is a move")
