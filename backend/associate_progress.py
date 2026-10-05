"""Associa UUID legado à conta verificada localmente; nunca disponível por HTTP."""
import argparse
from contextlib import closing

import auth
import progresso


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("usuario_id")
    parser.add_argument("email")
    args = parser.parse_args()
    email = args.email.strip().lower()
    with closing(auth.connect()) as db:
        if not db.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            parser.error("Conta não provisionada")
    progresso.criar_tabelas()
    progresso.associar_legado(args.usuario_id, email)
    print("Progresso associado; dados existentes preservados.")


if __name__ == "__main__":
    main()
