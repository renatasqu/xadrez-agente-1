"""Ingestão: documentos (PDF/TXT) -> texto limpo -> chunks -> embeddings -> ChromaDB.

Cria uma coleção do ChromaDB por índice (regras, fundamentos, estrategia), conforme o
mapeamento DOCUMENTOS do config.py. Cada chunk guarda nos metadados: documento, título,
página (ou bloco, no caso de TXT), local legível para citação e id do chunk.

Uso: cd backend && python ingest.py
"""

import logging
import re
import threading
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import chromadb
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

from config import DOCUMENTOS, DOCUMENTOS_COM_PARTIDAS, INDICES, TITULOS, settings

# O pypdf avisa sobre fontes a cada página; os avisos não afetam o texto extraído.
logging.getLogger("pypdf").setLevel(logging.ERROR)

TAMANHO_CHUNK = 800
SOBREPOSICAO = 100
TAMANHO_MINIMO_CHUNK = 60  # chunks menores que isso (ex.: "White to move") são descartados
LINHAS_POR_BLOCO_TXT = 80  # arquivos TXT não têm páginas; dividimos em blocos de linhas

# Linhas de diagrama do curso de Regis: a fonte de xadrez vira texto como
# "cuuuuuuuuC", "(rhb1kgn4}", "%$wGQIwDR}a" e "v,./9EFJMV".
_DIAGRAMA_PDF = re.compile(r"^(cuuuuuuuuC|v,\./9EFJMV|[(2-7&%]\S{8}\}\S?)$")
# Marcador "U" que indica a posição do diagrama no texto de Regis ("7.0-0 U DIAGRAM").
_MARCADOR_U = re.compile(r"(?<=\s)U(\s+DIAGRAM)?(?=\s|$)")
# Tabuleiros em ASCII do livro de Staunton: "+---+---+" e "| R*| N*| ...".
_TABULEIRO_ASCII = re.compile(r"^\s*(\+---\+|\|.*\|)")
# Rótulos que sobram dos tabuleiros removidos ("No. 7.", "BLACK.", "WHITE." sozinhos na linha).
_ROTULO_DIAGRAMA = re.compile(r"^\s*(No\. \d+\.?|BLACK\.|WHITE\.)\s*$")
# A impressão da página web das Leis da FIDE 2023 repete cada título várias vezes, sem
# separador ("FIDE LAWS OF CHESSFIDE LAWS OF CHESS..."). Um trecho de 15+ caracteres repetido
# imediatamente em seguida é reduzido a uma cópia.
_REPETICAO = re.compile(r"(.{15,}?)\1+")
# Marcas do Gutenberg no Capablanca: "[Illustration]" no lugar dos diagramas e números de
# página do livro impresso no meio das frases ("{24}").
_MARCAS_GUTENBERG = re.compile(r"\[Illustration(:[^\]]*)?\]|\{\d+\}")
# Menu e links do site da FIDE que aparecem no meio da impressão da página.
_MENU_SITE = re.compile(r"CONTENTS HANDBOOK.*?Financial Reports", re.DOTALL)
# Legendas dos diagramas de roque nas Leis da FIDE ("Before white kingside castling").
# Sem as imagens viram só a palavra "castling" repetida e empurravam a definição do roque
# (art. 3.8.2) para fora das 4 primeiras posições da busca.
_LEGENDA_ROQUE = re.compile(r"(Before|After) (white|black) (king|queen)side\s*castling\s*")
# Número de seção no início de uma linha: "3.8.2", "C.13", "II.3.2" (usado nas citações).
_SECAO = re.compile(r"^(\d{1,2}(?:\.\d{1,2})+|[A-D]\.\d{1,2}(?:\.\d{1,2})*|[IV]{1,3}\.\d{1,2}(?:\.\d{1,2})*)\s", re.MULTILINE)


@dataclass
class Pagina:
    """Um trecho de documento antes da divisão em chunks (página do PDF ou bloco do TXT)."""

    numero: int
    local: str  # texto usado na citação, ex.: "p. 6" ou "linhas 1201-1280"
    texto: str


def limpar_texto(texto: str) -> str:
    """Remove lixo de diagramas e de sites, normaliza caracteres e espaços.

    Mantém as quebras de parágrafo.
    """
    texto = unicodedata.normalize("NFKC", texto)  # ligaduras: "ﬁrst" -> "first"
    texto = _MENU_SITE.sub("", texto)
    texto = _MARCAS_GUTENBERG.sub("", texto)
    texto = _REPETICAO.sub(r"\1", texto)
    texto = _LEGENDA_ROQUE.sub("", texto)
    linhas = []
    for linha in texto.splitlines():
        if (
            _DIAGRAMA_PDF.match(linha.strip())
            or _TABULEIRO_ASCII.match(linha)
            or _ROTULO_DIAGRAMA.match(linha)
        ):
            continue
        linha = _MARCADOR_U.sub("", linha)
        linhas.append(re.sub(r"[ \t]+", " ", linha).strip())
    texto = "\n".join(linhas)
    return re.sub(r"\n{3,}", "\n\n", texto).strip()


def extrair_miolo_gutenberg(texto: str) -> str:
    """Mantém só o livro: entre o marcador START do Gutenberg e "THE END." (ou o marcador END)."""
    inicio = texto.find("*** START OF")
    if inicio != -1:
        texto = texto[texto.index("\n", inicio) + 1 :]
    for marcador in ("THE END.", "*** END OF"):
        fim = texto.find(marcador)
        if fim != -1:
            return texto[:fim]
    return texto


def ler_pdf(caminho: Path) -> list[Pagina]:
    """Lê um PDF página a página; páginas vazias são ignoradas."""
    paginas = []
    for numero, pagina in enumerate(PdfReader(caminho).pages, start=1):
        texto = limpar_texto(pagina.extract_text() or "")
        if texto:
            paginas.append(Pagina(numero, f"p. {numero}", texto))
    return paginas


def ler_txt(caminho: Path) -> list[Pagina]:
    """Lê um TXT do Gutenberg e divide em blocos de linhas, que fazem o papel de páginas."""
    linhas = extrair_miolo_gutenberg(caminho.read_text(encoding="utf-8")).splitlines()
    paginas = []
    for i in range(0, len(linhas), LINHAS_POR_BLOCO_TXT):
        texto = limpar_texto("\n".join(linhas[i : i + LINHAS_POR_BLOCO_TXT]))
        if texto:
            numero = i // LINHAS_POR_BLOCO_TXT + 1
            local = f"linhas {i + 1}-{min(i + LINHAS_POR_BLOCO_TXT, len(linhas))}"
            paginas.append(Pagina(numero, local, texto))
    return paginas


# Linha que começa com um número de lance ("12. Q. to K's 2d.", "12... Nf6") ou com uma nota
# de partida comentada ("[Footnote L: A strong move.]").
# O (?!\d) evita confundir com numeração de artigos, como "3.8.2".
_LINHA_DE_LANCE = re.compile(r"^\s*(\d{1,3}\.(?!\d)|\[Footnote)")
FRACAO_MAXIMA_LANCES = 0.4


def eh_lista_de_lances(chunk: str) -> bool:
    """True se mais de 40% das linhas do chunk são lances numerados (partidas transcritas).

    Esses chunks quase não têm texto explicativo e, na busca, empurram a prosa para baixo.
    """
    linhas = [linha for linha in chunk.splitlines() if linha.strip()]
    if not linhas:
        return False
    lances = sum(bool(_LINHA_DE_LANCE.match(linha)) for linha in linhas)
    return lances / len(linhas) > FRACAO_MAXIMA_LANCES


def dividir_em_chunks(
    texto: str, tamanho: int = TAMANHO_CHUNK, sobreposicao: int = SOBREPOSICAO
) -> list[str]:
    """Divide o texto em pedaços de até `tamanho` caracteres, sobrepostos em `sobreposicao`.

    O corte é feito, de preferência, no fim de um parágrafo, frase ou palavra, para não
    partir palavras ao meio.
    """
    chunks = []
    inicio = 0
    while inicio < len(texto):
        fim = min(inicio + tamanho, len(texto))
        if fim < len(texto):
            janela = texto[inicio + tamanho // 2 : fim]
            for separador in ("\n\n", ". ", "\n", " "):
                posicao = janela.rfind(separador)
                if posicao != -1:
                    fim = inicio + tamanho // 2 + posicao + len(separador)
                    break
        chunks.append(texto[inicio:fim].strip())
        if fim >= len(texto):
            break
        # Recua para criar a sobreposição, começando no início de uma palavra.
        proximo = fim - sobreposicao
        espaco = texto.find(" ", proximo, fim)
        inicio = espaco + 1 if espaco != -1 else proximo
    return [c for c in chunks if len(c) >= TAMANHO_MINIMO_CHUNK]


# Uma trava para carregar o modelo e gerar embeddings, uma chamada por vez. Na Fase 6 a API
# passou a usar threads e reproduzimos um travamento/segfault do PyTorch quando o modelo é
# carregado numa thread e duas threads geram embeddings ao mesmo tempo. Uma pergunta leva
# ~20 ms para virar vetor, então a fila não pesa. RLock: gerar_embeddings chama carregar_modelo.
_trava_do_modelo = threading.RLock()


@lru_cache
def _carregar_modelo() -> SentenceTransformer:
    return SentenceTransformer(settings.embedding_model)


def carregar_modelo() -> SentenceTransformer:
    """Carrega (uma vez, mesmo com várias threads) o modelo de embeddings multilíngue."""
    with _trava_do_modelo:
        return _carregar_modelo()


def gerar_embeddings(textos: list[str], tipo: str = "documento") -> list[list[float]]:
    """Gera embeddings normalizados (a similaridade de cosseno vira produto escalar).

    `tipo` é "documento" (chunks) ou "consulta" (perguntas): o e5 espera um prefixo diferente
    para cada um ("passage: " / "query: ").
    """
    prefixo = settings.prefixo_consulta if tipo == "consulta" else settings.prefixo_documento
    with _trava_do_modelo:  # uma geração por vez (ver _trava_do_modelo)
        vetores = carregar_modelo().encode(
            [prefixo + t for t in textos],
            batch_size=32,
            normalize_embeddings=True,
            show_progress_bar=len(textos) > 64,
        )
    return vetores.tolist()


@lru_cache
def cliente_chroma() -> chromadb.ClientAPI:
    """Cliente do ChromaDB persistente em backend/chroma/ (criado uma vez e reaproveitado)."""
    return chromadb.PersistentClient(path=str(settings.chroma_dir))


def ler_documento(caminho: Path) -> list[Pagina]:
    """Escolhe o leitor pela extensão do arquivo."""
    if caminho.suffix.lower() == ".pdf":
        return ler_pdf(caminho)
    if caminho.suffix.lower() == ".txt":
        return ler_txt(caminho)
    raise ValueError(f"Formato não suportado: {caminho.name}")


def secao_do_chunk(texto_pagina: str, inicio_chunk: int, chunk: str) -> str | None:
    """Seções (ex.: "3.8.2" ou "3.2–3.6") que o chunk cobre, para citações mais precisas.

    O início é a última seção começada antes do chunk (ou a primeira dentro dele); o fim é a
    última seção que começa dentro do chunk. Assim um trecho que vai do art. 3.1.2 ao 3.6 é
    citado como "3.1.2–3.6", e não só "3.1.2".
    """
    anteriores = [m.group(1) for m in _SECAO.finditer(texto_pagina, 0, inicio_chunk + 1)]
    dentro = [m.group(1) for m in _SECAO.finditer(chunk)]
    inicio = anteriores[-1] if anteriores else (dentro[0] if dentro else None)
    if inicio is None:
        return None
    fim = dentro[-1] if dentro else inicio
    return inicio if fim == inicio else f"{inicio}–{fim}"


def preparar_chunks(nome_arquivo: str, indice: str) -> tuple[list[str], list[str], list[dict]]:
    """Lê um documento e devolve (ids, textos, metadados) dos seus chunks."""
    ids, textos, metadados = [], [], []
    filtrar_lances = nome_arquivo in DOCUMENTOS_COM_PARTIDAS
    for pagina in ler_documento(settings.docs_dir / nome_arquivo):
        cursor = 0
        for n, chunk in enumerate(dividir_em_chunks(pagina.texto)):
            inicio = pagina.texto.find(chunk, cursor)
            cursor = max(inicio, cursor)
            if filtrar_lances and eh_lista_de_lances(chunk):
                continue
            secao = secao_do_chunk(pagina.texto, inicio, chunk)
            local = f"{pagina.local}, § {secao}" if secao else pagina.local
            chunk_id = f"{Path(nome_arquivo).stem}-p{pagina.numero}-c{n}"
            ids.append(chunk_id)
            textos.append(chunk)
            metadados.append(
                {
                    "documento": nome_arquivo,
                    "titulo": TITULOS.get(nome_arquivo, nome_arquivo),
                    "indice": indice,
                    "pagina": pagina.numero,
                    "local": local,
                    "chunk_id": chunk_id,
                }
            )
    return ids, textos, metadados


def ingerir() -> dict[str, int]:
    """Recria todas as coleções a partir de backend/docs e devolve o nº de chunks por índice."""
    cliente = cliente_chroma()
    resumo = {}
    for indice in INDICES:
        # Recriar a coleção torna a ingestão idempotente (rodar de novo não duplica chunks).
        if indice in [c.name for c in cliente.list_collections()]:
            cliente.delete_collection(indice)
        colecao = cliente.create_collection(indice, metadata={"hnsw:space": "cosine"})

        total = 0
        for nome_arquivo, indice_doc in DOCUMENTOS.items():
            if indice_doc != indice:
                continue
            if not (settings.docs_dir / nome_arquivo).exists():
                print(f"  [aviso] {nome_arquivo} não encontrado em docs/, pulando")
                continue
            ids, textos, metadados = preparar_chunks(nome_arquivo, indice)
            embeddings = gerar_embeddings(textos)
            # O Chroma limita o tamanho de cada inserção; inserimos em lotes.
            for i in range(0, len(ids), 1000):
                colecao.add(
                    ids=ids[i : i + 1000],
                    documents=textos[i : i + 1000],
                    embeddings=embeddings[i : i + 1000],
                    metadatas=metadados[i : i + 1000],
                )
            print(f"  {indice:<11} {nome_arquivo:<28} {len(ids):>5} chunks")
            total += len(ids)
        resumo[indice] = total
    return resumo


if __name__ == "__main__":
    print(f"Ingerindo documentos de {settings.docs_dir} ...")
    resumo = ingerir()
    print("Total por índice:", resumo)
