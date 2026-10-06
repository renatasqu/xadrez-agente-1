"""Backup SQLite consistente e restore sem sobrescrita. Não importa config/.env."""
import argparse
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile


def verify(source: Path) -> None:
    if source.is_symlink() or not source.is_file():
        raise ValueError("Origem deve ser arquivo SQLite existente, sem symlink.")
    with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("Verificação de integridade falhou.")


def snapshot(source: Path, destination: Path) -> None:
    """Também usado no restore; publicação atômica e recusa destino existente."""
    verify(source)
    if destination.exists() or destination.is_symlink():
        raise ValueError("Destino já existe; nenhum arquivo foi substituído.")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".sqlite-backup-", dir=destination.parent)
    os.close(fd)
    temporary = Path(temporary)
    try:
        with closing(sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)) as src:
            with closing(sqlite3.connect(temporary)) as dst:
                src.backup(dst)
        verify(temporary)
        # link falha se outro processo criar o destino; nunca sobrescreve.
        os.link(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("backup", "verify", "restore"))
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path, nargs="?")
    args = parser.parse_args()
    try:
        if args.operation == "verify":
            verify(args.source)
        elif args.destination is None:
            parser.error("backup/restore exigem destino novo; pare a aplicação antes do restore.")
        else:
            snapshot(args.source, args.destination)
    except (ValueError, OSError, sqlite3.Error):
        parser.exit(1, "Operação recusada: confira origem, integridade, permissões e destino inexistente.\n")
    print("SQLite: operação concluída e integridade verificada.")


if __name__ == "__main__":
    main()
