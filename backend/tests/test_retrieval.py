"""Testes da busca. Os que consultam o ChromaDB exigem rodar antes: python ingest.py"""

import pytest

from config import settings
from ingest import cliente_chroma
from retrieval import buscar, expandir_pergunta

indices_prontos = {c.name for c in cliente_chroma().list_collections()}
precisa_ingestao = pytest.mark.skipif(
    "regras" not in indices_prontos, reason="rode 'python ingest.py' antes"
)


def test_expande_termo_de_xadrez():
    assert "castling" in expandir_pergunta("Como funciona o roque?")
    assert "pin" in expandir_pergunta("O que é uma CRAVADA?")  # ignora maiúsculas e acentos


def test_nao_expande_pergunta_sem_termos_de_xadrez():
    assert expandir_pergunta("receita de bolo") == "receita de bolo"


def test_indice_desconhecido():
    with pytest.raises(ValueError):
        buscar("culinaria", "roque")


@precisa_ingestao
def test_roque_no_indice_regras():
    trechos = buscar("regras", "roque")
    assert trechos, "a busca por 'roque' deveria devolver algum trecho"
    assert all(t.score >= settings.min_score for t in trechos)
    assert all(t.documento == "Laws_of_Chess-2023.pdf" for t in trechos)
    assert any("castl" in t.texto.lower() for t in trechos)


@precisa_ingestao
def test_roque_traz_a_definicao_principal():
    """A definição do roque (art. 3.8.2 das Leis de 2023) deve estar entre os trechos."""
    trechos = buscar("regras", "roque")
    assert any("§ 3.8" in t.local and "two squares" in t.texto for t in trechos)


@precisa_ingestao
def test_trecho_tem_dados_para_citacao():
    trecho = buscar("regras", "roque")[0]
    assert trecho.titulo and trecho.local.startswith("p. ") and trecho.chunk_id


@precisa_ingestao
def test_pergunta_fora_do_tema_nao_retorna_trechos():
    assert buscar("regras", "receita de bolo de chocolate") == []
