"""Busca semântica nos índices do ChromaDB, com limiar mínimo de similaridade (MIN_SCORE).

Os documentos estão em inglês e as perguntas chegam em português. O modelo multilíngue liga
bem frases comuns entre as línguas, mas não o vocabulário de xadrez ("roque" x "castling").
Por isso a pergunta é expandida com os termos em inglês de um pequeno glossário antes da busca.
"""

import re
import unicodedata
from dataclasses import dataclass

from config import INDICES, settings
from ingest import cliente_chroma, gerar_embeddings

# Termo em português (sem acentos, minúsculo) -> termos equivalentes em inglês nos documentos.
GLOSSARIO: dict[str, str] = {
    # regras
    "roque": "castling castle",
    "en passant": "en passant capture",
    "promocao": "promotion promote pawn",
    "promover": "promotion promote pawn",
    "coroar": "promotion queen a pawn",
    "xeque-mate": "checkmate",
    "xeque mate": "checkmate",
    "xeque": "check",
    "afogamento": "stalemate",
    "afogado": "stalemate",
    "empate": "draw drawn game",
    "empatada": "draw drawn game",
    "repeticao": "repetition same position",
    "50 lances": "fifty moves 50 moves",
    "cinquenta lances": "fifty moves 50 moves",
    "relogio": "chess clock time",
    "arbitro": "arbiter",
    "lance ilegal": "illegal move",
    "notacao": "notation",
    "tabuleiro": "chessboard board",
    "coluna": "file",
    "fileira": "rank",
    # movimento das peças (FIDE art. 3: "The knight may move to...")
    "move": "move moves may move to",
    "movem": "move moves may move to",
    "mover": "move moves may move to",
    "mexe": "move moves may move to",
    "anda": "move moves may move to",
    "andam": "move moves may move to",
    "movimento": "move moves may move to",
    "movimenta": "move moves may move to",
    # "Como funciona o cavalo?" / "Como joga a torre?": na prática, perguntas sobre o movimento
    "como funciona": "move moves may move to",
    "como funcionam": "move moves may move to",
    "como joga": "move moves may move to",
    "como jogam": "move moves may move to",
    # peças
    "rei": "king",
    "dama": "queen",
    "rainha": "queen",
    "torre": "rook",
    "bispo": "bishop",
    "cavalo": "knight",
    "peao": "pawn",
    "peoes": "pawns",
    "peca": "piece",
    "pecas": "pieces men",
    "valor": "value",
    # fundamentos
    "abertura": "opening",
    "gambito": "gambit",
    "defesa": "defence",
    "final": "ending endgame",
    "finais": "endings endgame",
    "oposicao": "opposition",
    "centro": "centre centre squares",
    "desenvolver": "develop development pieces",
    "desenvolvimento": "develop development pieces",
    "peao passado": "passed pawn",
    "peao dobrado": "doubled pawn",
    "peao isolado": "isolated pawn",
    # tática
    "tatica": "tactics",
    "combinacao": "combination",
    "garfo": "fork",
    "cravada": "pin pinned",
    "cravar": "pin pinned",
    "espeto": "skewer",
    "ataque descoberto": "discovered attack discovery unmasking",
    "xeque descoberto": "discovered check",
    "xeque duplo": "double check",
    "sobrecarga": "overloading overloaded",
    "desvio": "decoy",
    "atracao": "decoy",
    "interferencia": "interference",
    "lance intermediario": "zwischenzug intermezzo in-between move",
    "sacrificio": "sacrifice",
    "armadilha": "trap",
    "peca solta": "loose piece undefended",
    "mate abafado": "smothered mate",
    "mate do pastor": "scholar's mate",
    "mate do corredor": "back rank mate",
}


def _normalizar(texto: str) -> str:
    """Minúsculas e sem acentos, para comparar com as chaves do glossário."""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return sem_acento.lower()


def expandir_pergunta(pergunta: str) -> str:
    """Acrescenta à pergunta os termos em inglês dos conceitos de xadrez que ela menciona.

    O formato "pergunta: termos" foi o que deu melhor ranqueamento num teste com 10
    perguntas (página certa entre as 4 primeiras em 10/10; com parênteses, 7/10).
    """
    texto = _normalizar(pergunta)
    termos = []
    for termo_pt, termos_en in GLOSSARIO.items():
        if re.search(rf"\b{re.escape(termo_pt)}\b", texto) and termos_en not in termos:
            termos.append(termos_en)
    return f"{pergunta}: {' '.join(termos)}" if termos else pergunta


@dataclass
class Trecho:
    """Um trecho recuperado, com os dados necessários para citar a fonte."""

    texto: str
    documento: str
    titulo: str
    pagina: int
    local: str
    chunk_id: str
    score: float  # similaridade de cosseno entre pergunta e trecho (0 a 1)


def buscar(
    indice: str, pergunta: str, k: int = 4, min_score: float | None = None
) -> list[Trecho]:
    """Devolve até `k` trechos do índice com similaridade >= `min_score` (padrão: MIN_SCORE).

    Lista vazia significa "não encontrei isso nos documentos": quem chama não deve inventar.
    """
    if indice not in INDICES:
        raise ValueError(f"Índice desconhecido: {indice!r}. Use um de {INDICES}.")
    if indice == "regras":
        from conceitos import resolver
        from regras_curadas import fontes_para

        fontes = fontes_para(pergunta, resolver(pergunta, "regras"))
        if fontes:
            # Localização determinística de referência; nenhum embedding/Chroma é usado.
            return [Trecho(texto=f.trecho, documento=f.documento, titulo=f.titulo,
                           pagina=1, local=f.local, chunk_id=f"curado:fide:{i}", score=1.0)
                    for i, f in enumerate(fontes)][:k]
    limiar = settings.min_score if min_score is None else min_score

    colecoes = [c.name for c in cliente_chroma().list_collections()]
    if indice not in colecoes:
        raise RuntimeError(f"Índice {indice!r} vazio. Rode antes: cd backend && python ingest.py")

    resultado = cliente_chroma().get_collection(indice).query(
        query_embeddings=gerar_embeddings([expandir_pergunta(pergunta)], tipo="consulta"),
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )

    trechos = []
    for texto, meta, distancia in zip(
        resultado["documents"][0], resultado["metadatas"][0], resultado["distances"][0]
    ):
        score = 1 - distancia  # o Chroma devolve distância de cosseno
        if score >= limiar:
            trechos.append(
                Trecho(
                    texto=texto,
                    documento=meta["documento"],
                    titulo=meta["titulo"],
                    pagina=meta["pagina"],
                    local=meta["local"],
                    chunk_id=meta["chunk_id"],
                    score=round(score, 3),
                )
            )
    return trechos


def ler_chunk(indice: str, chunk_id: str) -> tuple[str, dict] | None:
    """Texto e metadados de um chunk pelo id (None se não existir no índice)."""
    if indice not in INDICES:
        return None
    colecoes = [c.name for c in cliente_chroma().list_collections()]
    if indice not in colecoes:
        return None
    achado = cliente_chroma().get_collection(indice).get(ids=[chunk_id], include=["documents", "metadatas"])
    if not achado["ids"]:
        return None
    return achado["documents"][0], achado["metadatas"][0]
