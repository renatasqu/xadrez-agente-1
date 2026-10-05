"""Segurança e funcionamento de GET /documentos (botão "Ver no documento")."""

import os

import pytest
from fastapi.testclient import TestClient

import config
import documentos
import main
import retrieval
from config import settings

PDF = b"%PDF-1.4\n% documento falso para teste\n"
TXT = (
    "Primeiro parágrafo do livro.\n\n"
    "Segundo parágrafo, antes do trecho.\n\n"
    "Terceiro parágrafo, logo antes.\n\n"
    "The centre is of great importance. No attack can succeed without it.\n\n"
    "Quarto parágrafo, logo depois.\n\n"
    "Quinto parágrafo.\n\n"
    "Sexto parágrafo, longe demais."
)
TRECHO = "The centre is of great importance. No attack can succeed without it."


@pytest.fixture
def pasta(tmp_path, monkeypatch):
    """backend/docs falso: um PDF, um TXT, um segredo fora da pasta e um link apontando para ele."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "Laws_of_Chess-2023.pdf").write_bytes(PDF)
    (docs / "capablanca_chess_fundamentals.txt").write_text(TXT, encoding="utf-8")
    (docs / "nao_listado.pdf").write_bytes(PDF)  # existe, mas não está na allowlist
    segredo = tmp_path / "segredo.txt"
    segredo.write_text("ANTHROPIC_API_KEY=sk-ant-segredo", encoding="utf-8")
    os.symlink(segredo, docs / "link.txt")
    monkeypatch.setattr(settings, "docs_dir", docs)
    monkeypatch.setattr(config, "DOCUMENTOS", {**config.DOCUMENTOS, "link.txt": "fundamentos"})
    monkeypatch.setattr(documentos.config, "DOCUMENTOS", config.DOCUMENTOS)
    documentos.paginas_do_documento.cache_clear()
    yield docs
    documentos.paginas_do_documento.cache_clear()


@pytest.fixture
def cliente(pasta, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "aquecer_na_inicializacao", False)
    monkeypatch.setattr(settings, "db_progresso", tmp_path / "p.sqlite")
    main.limiter.reset()
    with TestClient(main.app) as c:
        yield c


def test_serve_o_pdf_da_lista(cliente):
    resposta = cliente.get("/documentos/Laws_of_Chess-2023.pdf")
    assert resposta.status_code == 200 and resposta.content == PDF
    assert resposta.headers["content-type"] == "application/pdf"
    assert resposta.headers["content-disposition"].startswith("inline")
    assert resposta.headers["x-content-type-options"] == "nosniff"


def test_serve_o_txt_da_lista(cliente):
    resposta = cliente.get("/documentos/capablanca_chess_fundamentals.txt")
    assert resposta.status_code == 200 and resposta.headers["content-type"].startswith("text/plain")


@pytest.mark.parametrize(
    "caminho",
    [
        "/documentos/nao_listado.pdf",  # existe na pasta, mas fora da allowlist
        "/documentos/link.txt",  # na allowlist, mas é link simbólico para fora
        "/documentos/..%2F..%2F.env",
        "/documentos/%2e%2e%2f.env",
        "/documentos/%2e%2e",
        "/documentos/..",
        "/documentos/.env",
        "/documentos/%2Fetc%2Fpasswd",
        "/documentos/chroma.sqlite3",
        "/documentos/..%2Fchroma%2Fchroma.sqlite3",
        "/documentos/..%2Fprogresso.sqlite",
        "/documentos/lasker_manual.pdf",  # na allowlist, mas o arquivo não existe
        "/documentos/Laws_of_Chess-2023.PDF",  # nome diferente do da lista
    ],
)
def test_bloqueia_travessia_e_arquivos_fora_da_lista(cliente, caminho):
    resposta = cliente.get(caminho)
    assert resposta.status_code == 404
    assert resposta.json()["resposta"] == main.MSG_NAO_ENCONTRADO  # formato de Resposta
    assert b"sk-ant" not in resposta.content and b"%PDF" not in resposta.content


def test_caminho_seguro_rejeita_absoluto_e_subpasta(pasta, monkeypatch):
    monkeypatch.setattr(config, "DOCUMENTOS", {"/etc/passwd": "x", "sub/arquivo.pdf": "x"})
    for nome in ["/etc/passwd", "sub/arquivo.pdf"]:
        with pytest.raises(documentos.DocumentoNaoEncontrado):
            documentos.caminho_seguro(nome)


def test_rota_inexistente_tambem_vem_no_formato_de_resposta(cliente):
    resposta = cliente.get("/nao-existe")
    assert resposta.status_code == 404 and resposta.json()["resposta"] == main.MSG_NAO_ENCONTRADO


@pytest.fixture
def chunk_do_txt(monkeypatch):
    metadados = {"documento": "capablanca_chess_fundamentals.txt", "pagina": 1, "local": "linhas 1-13"}
    chunks = {"capablanca-p1-c3": (TRECHO, metadados)}
    monkeypatch.setattr(retrieval, "ler_chunk", lambda indice, chunk_id: chunks.get(chunk_id))


def test_contexto_traz_paragrafos_antes_e_depois(cliente, chunk_do_txt, monkeypatch):
    # A "página" do TXT é o próprio texto de teste (sem o cabeçalho do Gutenberg).
    monkeypatch.setattr("ingest.ler_documento", lambda caminho: [type("P", (), {"numero": 1, "texto": TXT})()])
    dados = cliente.get("/documentos/capablanca_chess_fundamentals.txt/contexto?chunk_id=capablanca-p1-c3").json()
    assert dados["trecho"] == TRECHO and dados["autor"] == "J. R. Capablanca"
    assert dados["antes"] == ["Segundo parágrafo, antes do trecho.", "Terceiro parágrafo, logo antes."]
    assert dados["depois"] == ["Quarto parágrafo, logo depois.", "Quinto parágrafo."]


@pytest.mark.parametrize(
    "consulta",
    [
        "chunk_id=nao-existe",
        "chunk_id=..%2F..%2F.env",
        "chunk_id=" + "a" * 300,
        "chunk_id=%27%20OR%201%3D1",
    ],
)
def test_contexto_com_chunk_invalido(cliente, chunk_do_txt, consulta):
    resposta = cliente.get(f"/documentos/capablanca_chess_fundamentals.txt/contexto?{consulta}")
    assert resposta.status_code == 404 and resposta.json()["resposta"] == main.MSG_NAO_ENCONTRADO


def test_contexto_nao_mistura_documentos(cliente, chunk_do_txt):
    # O chunk é do Capablanca; pedir pelo PDF da FIDE não pode devolvê-lo.
    resposta = cliente.get("/documentos/Laws_of_Chess-2023.pdf/contexto?chunk_id=capablanca-p1-c3")
    assert resposta.status_code == 404


def test_contexto_de_documento_fora_da_lista(cliente, chunk_do_txt):
    assert cliente.get("/documentos/link.txt/contexto?chunk_id=capablanca-p1-c3").status_code == 404


def test_contexto_sem_chunk_id_da_erro_amigavel(cliente):
    resposta = cliente.get("/documentos/capablanca_chess_fundamentals.txt/contexto")
    assert resposta.status_code == 422 and resposta.json()["resposta"] == main.MSG_INVALIDO


@pytest.fixture(autouse=True)
def authenticated_protocol():
    from auth import require_user
    main.app.dependency_overrides[require_user] = lambda: {"name": "Test", "email": "test@example.com"}
    yield
    main.app.dependency_overrides.pop(require_user, None)
