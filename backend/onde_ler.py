"""Bloco "Onde ler": os melhores trechos para a pessoa ler no documento original.

Tudo é decidido pelo código, sem chamar o LLM:
- a ordem vem do score da busca (o melhor trecho e até mais 2 que fiquem a no máximo
  MARGEM_DO_SCORE dele; os scores do e5 ficam muito próximos, então a margem é pequena);
- a frase destacada é a frase do trecho mais parecida com a pergunta, pelo mesmo modelo de
  embeddings da busca (nada novo para baixar).
"""

import re
from typing import Callable

from config import AUTORES
from retrieval import Trecho, expandir_pergunta
from schemas import TrechoRecomendado

MAXIMO_DE_TRECHOS = 3
MARGEM_DO_SCORE = 0.03
TAMANHO_MINIMO_DA_FRASE = 25  # caracteres; frases menores (títulos, "No. 12.") não servem

# Fim de frase: . ! ? ; seguido de espaço (inclusive quebra de linha), ou um parágrafo novo.
# PDFs e livros do Gutenberg quebram a linha no meio da frase, então quebra de linha simples não
# separa frases; e o ponto de "3.8.2" (sem espaço depois) também não.
_FIM_DE_FRASE = re.compile(r"(?<=[.!?;])\s+|\n\s*\n")
_PALAVRA = re.compile(r"[A-Za-zÀ-ÿ]{3,}")
# Frases que não servem de destaque: listas de lances, cabeçalhos de partidas, copyright.
_LANCE = re.compile(r"\b\d+\.\s*(?:\.\.\.)?\s*(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O)")
_LIXO = re.compile(
    r"\[[A-E]\d\d\]|\(c\)|copyright|all rights reserved|reproduced or\s+transmitted|gutenberg"
    r"|produced by|proofread|\b[a-h][1-8][a-h][1-8]\b",
    re.IGNORECASE,
)
MINIMO_DE_PALAVRAS = 5
TAMANHO_MAXIMO_DA_FRASE = 420  # as frases da FIDE são longas; acima disso, em geral são títulos emendados


def frase_util(frase: str) -> bool:
    """A frase tem texto de verdade (não é lista de lances, cabeçalho, página de rosto etc.)?"""
    if not TAMANHO_MINIMO_DA_FRASE <= len(frase) <= TAMANHO_MAXIMO_DA_FRASE or _LIXO.search(frase):
        return False
    letras = [c for c in frase if c.isalpha()]
    if sum(c.isupper() for c in letras) > 0.6 * len(letras):  # "NEW YORK HARCOURT, BRACE..."
        return False
    return len(_PALAVRA.findall(frase)) >= MINIMO_DE_PALAVRAS and len(_LANCE.findall(frase)) < 2


def frases(texto: str) -> list[str]:
    """Frases úteis do trecho, exatamente como aparecem nele (para o frontend poder destacar)."""
    partes = (frase.strip() for frase in _FIM_DE_FRASE.split(texto))
    return [frase for frase in partes if frase_util(frase)]


def similaridades_por_embedding(pergunta: str, candidatas: list[str]) -> list[float]:
    """Similaridade de cosseno entre a pergunta (expandida pelo glossário) e cada frase."""
    from ingest import gerar_embeddings

    consulta = gerar_embeddings([expandir_pergunta(pergunta)], tipo="consulta")[0]
    vetores = gerar_embeddings(candidatas, tipo="documento")
    return [sum(a * b for a, b in zip(consulta, v)) for v in vetores]  # vetores já normalizados


# Trocada nos testes offline por uma versão sem modelo (tests/conftest.py).
similaridades: Callable[[str, list[str]], list[float]] = similaridades_por_embedding


def frase_chave(pergunta: str, texto: str) -> str:
    """A frase do trecho que melhor responde à pergunta ("" se o trecho não tiver frases)."""
    candidatas = frases(texto)
    if not candidatas:
        return ""
    notas = similaridades(pergunta, candidatas)
    return candidatas[max(range(len(candidatas)), key=notas.__getitem__)]


def candidatos(trechos: list[Trecho]) -> list[Trecho]:
    """Trechos pelo score da busca (maior primeiro), sem repetidos, perto do melhor."""
    unicos = {t.chunk_id: t for t in trechos if not t.chunk_id.startswith("curado:")}.values()
    ordenados = sorted(unicos, key=lambda t: t.score, reverse=True)
    if not ordenados:
        return []
    melhor = ordenados[0].score
    return [t for t in ordenados if t.score >= melhor - MARGEM_DO_SCORE]


def escolher_trechos(trechos: list[Trecho]) -> list[Trecho]:
    """Os melhores trechos pelo score da busca: o 1º e os que ficam perto dele (até 3)."""
    return candidatos(trechos)[:MAXIMO_DE_TRECHOS]


def recomendar(pergunta: str, trechos: list[Trecho]) -> list[TrechoRecomendado]:
    """Monta o bloco "Onde ler": até 3 trechos, na ordem da busca, cada um com a frase-chave.

    Trecho sem nenhuma frase legível (só lances, créditos do Gutenberg...) não é recomendado:
    não ajuda quem vai ler; o próximo da busca entra no lugar.
    """
    recomendados = []
    for t in candidatos(trechos):
        frase = frase_chave(pergunta, t.texto)
        if not frase:
            continue
        recomendados.append(
            TrechoRecomendado(
                documento=t.documento,
                titulo=t.titulo,
                autor=AUTORES.get(t.documento, ""),
                local=t.local,
                pagina=t.pagina,
                chunk_id=t.chunk_id,
                trecho=t.texto,
                frase_destaque=frase,
                score=round(t.score, 3),
            )
        )
        if len(recomendados) == MAXIMO_DE_TRECHOS:
            break
    return recomendados
