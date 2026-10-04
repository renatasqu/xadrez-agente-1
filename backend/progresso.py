"""Progresso das lições em SQLite (biblioteca padrão), com id anônimo.

Tabelas:
- progresso(usuario_id, proxima, atualizado): número da próxima lição de cada id (começa em 1).
  O id é um UUID gerado pelo servidor; nenhum dado pessoal é guardado (guardrail 8).
- licoes_cache(numero, conteudo_json): conteúdo já gerado de cada lição. As lições são iguais
  para todos, então cada uma é gerada pelo LLM só uma vez. POST /ingest limpa o cache.

Cada função abre e fecha a própria conexão: o sqlite3 não deve compartilhar conexões entre as
threads que atendem as requisições.
"""

import sqlite3
from contextlib import closing
from datetime import datetime, timezone

from config import settings
from schemas import Resposta


def _conectar() -> sqlite3.Connection:
    """Abre uma conexão com o arquivo do config (criado se não existir)."""
    settings.db_progresso.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(settings.db_progresso)


def criar_tabelas() -> None:
    """Cria as tabelas, se ainda não existirem."""
    with closing(_conectar()) as con, con:
        con.execute(
            "CREATE TABLE IF NOT EXISTS progresso ("
            " usuario_id TEXT PRIMARY KEY,"
            " proxima INTEGER NOT NULL DEFAULT 1,"
            " atualizado TEXT NOT NULL)"
        )
        con.execute(
            "CREATE TABLE IF NOT EXISTS licoes_cache ("
            " numero INTEGER PRIMARY KEY,"
            " conteudo_json TEXT NOT NULL)"
        )

        con.execute(
            "CREATE TABLE IF NOT EXISTS progresso_exercicios ("
            " usuario_id TEXT NOT NULL, exercise_id TEXT NOT NULL, concept_id TEXT NOT NULL,"
            " status TEXT NOT NULL CHECK(status IN ('in_progress', 'completed')),"
            " attempts INTEGER NOT NULL, updated_at TEXT NOT NULL,"
            " PRIMARY KEY(usuario_id, exercise_id))"
        )


def proxima_licao(usuario_id: str) -> int:
    """Número da próxima lição do usuário (1 se ele ainda não começou)."""
    with closing(_conectar()) as con:
        linha = con.execute(
            "SELECT proxima FROM progresso WHERE usuario_id = ?", (usuario_id,)
        ).fetchone()
    return linha[0] if linha else 1


def avancar(usuario_id: str, entregue: int) -> None:
    """Marca a lição `entregue` como vista (a próxima passa a ser entregue + 1).

    O WHERE com `proxima` evita avançar duas vezes se chegarem dois pedidos iguais juntos.
    """
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with closing(_conectar()) as con, con:
        con.execute(
            "INSERT OR IGNORE INTO progresso (usuario_id, proxima, atualizado) VALUES (?, 1, ?)",
            (usuario_id, agora),
        )
        con.execute(
            "UPDATE progresso SET proxima = ?, atualizado = ? WHERE usuario_id = ? AND proxima = ?",
            (entregue + 1, agora, usuario_id, entregue),
        )


def ler_cache(numero: int) -> Resposta | None:
    """Conteúdo já gerado da lição, se houver."""
    with closing(_conectar()) as con:
        linha = con.execute(
            "SELECT conteudo_json FROM licoes_cache WHERE numero = ?", (numero,)
        ).fetchone()
    return Resposta.model_validate_json(linha[0]) if linha else None


def gravar_cache(numero: int, conteudo: Resposta) -> None:
    """Guarda o conteúdo gerado da lição."""
    with closing(_conectar()) as con, con:
        con.execute(
            "INSERT OR REPLACE INTO licoes_cache (numero, conteudo_json) VALUES (?, ?)",
            (numero, conteudo.model_dump_json()),
        )


def limpar_cache() -> None:
    """Apaga o conteúdo das lições (depois de reingerir os documentos)."""
    with closing(_conectar()) as con, con:
        con.execute("DELETE FROM licoes_cache")


def registrar_exercicio(usuario_id: str, exercise_id: str, status: str) -> None:
    """Registra cada ValidationResult; conclusão é monotônica e exige correct.

    Uma tentativa é uma ação validada (incluindo partial), não um GET nem erro de protocolo.
    """
    from conceitos import conceito_do_exercicio

    concept_id = conceito_do_exercicio(exercise_id)
    if concept_id is None:
        raise ValueError("Exercício sem conceito curado")
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with closing(_conectar()) as con, con:
        con.execute(
            "INSERT INTO progresso_exercicios "
            "(usuario_id, exercise_id, concept_id, status, attempts, updated_at) "
            "VALUES (?, ?, ?, ?, 1, ?) "
            "ON CONFLICT(usuario_id, exercise_id) DO UPDATE SET "
            "status = CASE WHEN progresso_exercicios.status = 'completed' OR excluded.status = 'completed' "
            "THEN 'completed' ELSE 'in_progress' END, "
            "attempts = progresso_exercicios.attempts + 1, updated_at = excluded.updated_at",
            (usuario_id, exercise_id, concept_id, "completed" if status == "correct" else "in_progress", agora),
        )


def ler_exercicios(usuario_id: str) -> list[dict]:
    """Consulta sem criar tentativas ou concluir exercícios."""
    with closing(_conectar()) as con:
        con.row_factory = sqlite3.Row
        linhas = con.execute(
            "SELECT exercise_id, concept_id, status, attempts, updated_at "
            "FROM progresso_exercicios WHERE usuario_id = ? ORDER BY exercise_id", (usuario_id,),
        ).fetchall()
    return [dict(linha) for linha in linhas]
