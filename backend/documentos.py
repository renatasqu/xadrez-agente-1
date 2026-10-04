"""Acesso seguro aos documentos locais (backend/docs), para o botão "Ver no documento".

Só é servido o que está na lista DOCUMENTOS do config (allowlist). Mesmo assim, o caminho é
conferido de novo: nome simples (sem pastas), sem link simbólico, resolvido dentro de docs/ e
com extensão .pdf ou .txt. Qualquer falha vira "não encontrado" (sem dizer o motivo a quem pede).
"""

import re
from functools import lru_cache
from pathlib import Path

import config
from config import AUTORES, TITULOS, settings

TIPOS: dict[str, str] = {".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8"}
PARAGRAFOS_DE_CONTEXTO = 2  # antes e depois do trecho
_CHUNK_ID = re.compile(r"^[A-Za-z0-9_.\-]{1,200}$")
_PARAGRAFO = re.compile(r"\n\s*\n")


class DocumentoNaoEncontrado(Exception):
    """O documento ou o trecho pedido não existe (ou não pode ser servido)."""


def caminho_seguro(nome: str) -> Path:
    """Caminho do documento, só se ele estiver na allowlist e dentro de backend/docs."""
    if nome not in config.DOCUMENTOS or Path(nome).name != nome or nome.startswith("."):
        raise DocumentoNaoEncontrado
    pasta = settings.docs_dir.resolve()
    caminho = settings.docs_dir / nome
    if caminho.is_symlink():  # um link em docs/ poderia apontar para fora (ex.: o .env)
        raise DocumentoNaoEncontrado
    resolvido = caminho.resolve()
    if resolvido.parent != pasta or not resolvido.is_file() or resolvido.suffix.lower() not in TIPOS:
        raise DocumentoNaoEncontrado
    return resolvido


def tipo_do_arquivo(caminho: Path) -> str:
    """Content-Type do documento."""
    return TIPOS[caminho.suffix.lower()]


@lru_cache(maxsize=8)
def paginas_do_documento(nome: str) -> dict[int, str]:
    """Texto limpo de cada página (PDF) ou bloco (TXT), igual ao que foi indexado."""
    from ingest import ler_documento

    return {p.numero: p.texto for p in ler_documento(caminho_seguro(nome))}


def contexto(nome: str, chunk_id: str) -> dict:
    """O trecho com até 2 parágrafos antes e depois, para ler no contexto do livro."""
    caminho_seguro(nome)  # o documento precisa estar liberado
    if not _CHUNK_ID.match(chunk_id):
        raise DocumentoNaoEncontrado
    from retrieval import ler_chunk

    achado = ler_chunk(config.DOCUMENTOS[nome], chunk_id)
    if achado is None or achado[1].get("documento") != nome:  # trecho de outro documento
        raise DocumentoNaoEncontrado
    texto_do_chunk, metadados = achado
    paginas = paginas_do_documento(nome)
    numero = int(metadados.get("pagina", 0))
    # A página do trecho e as vizinhas, para o contexto não parar na borda do bloco.
    vizinhas = [paginas[n] for n in (numero - 1, numero, numero + 1) if n in paginas]
    texto = "\n\n".join(vizinhas)
    inicio = texto.find(texto_do_chunk)
    if inicio < 0:
        antes, depois = [], []
    else:
        antes = [p.strip() for p in _PARAGRAFO.split(texto[:inicio]) if p.strip()]
        depois = [p.strip() for p in _PARAGRAFO.split(texto[inicio + len(texto_do_chunk):]) if p.strip()]
    return {
        "documento": nome,
        "titulo": TITULOS.get(nome, nome),
        "autor": AUTORES.get(nome, ""),
        "local": metadados.get("local", ""),
        "antes": antes[-PARAGRAFOS_DE_CONTEXTO:],
        "trecho": texto_do_chunk,
        "depois": depois[:PARAGRAFOS_DE_CONTEXTO],
    }
