"""Configure a conta pessoal: cd backend && ../.venv/bin/python configure_owner.py."""
from getpass import getpass
from auth import configure_owner

if __name__ == "__main__":
    email = input("E-mail: ").strip()
    name = input("Nome: ").strip()
    password = getpass("Senha: ")
    if len(password) < 8 or "@" not in email or not name:
        raise SystemExit("Informe nome, e-mail válido e senha com pelo menos 8 caracteres.")
    configure_owner(email, name, password)
    print("Conta pessoal configurada. Nenhuma senha em texto puro foi salva.")
