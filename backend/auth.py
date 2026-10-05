"""Conta pessoal local e sessões em cookies HttpOnly; sem cadastro público."""
import hashlib
import hmac
import secrets
import sqlite3
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import settings

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)
COOKIE = "xadrez_session"
SESSION_SECONDS = 60 * 60 * 24 * 7


def connect():
    db = sqlite3.connect(settings.db_auth)
    db.execute("CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires REAL NOT NULL)")
    return db


def password_hash(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def configure_owner(email: str, name: str, password: str):
    """Provisionamento local; nunca chamado por uma rota pública."""
    salt = secrets.token_hex(16)
    with connect() as db:
        db.execute("INSERT OR REPLACE INTO users VALUES (?, ?, ?, ?)", (email.strip().lower(), name, salt, password_hash(password, salt)))
        db.execute("DELETE FROM sessions WHERE email = ?", (email.strip().lower(),))
    Path(settings.db_auth).chmod(0o600)


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=1024)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def check_origin(request: Request):
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origens:
        raise HTTPException(403, "Origem não autorizada.")


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, data: Login, response: Response):
    check_origin(request)
    with connect() as db:
        user = db.execute("SELECT email, name, salt, password_hash FROM users WHERE email = ?", (data.email.strip().lower(),)).fetchone()
        salt = user[2] if user else "00" * 16
        digest = password_hash(data.password, salt)
        if not user or not hmac.compare_digest(digest, user[3]):
            raise HTTPException(401, "E-mail ou senha incorretos.")
        token = secrets.token_urlsafe(32)
        db.execute("DELETE FROM sessions WHERE expires <= ?", (time.time(),))
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_hash(token), user[0], time.time() + SESSION_SECONDS))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=settings.auth_cookie_secure, samesite="lax", path="/auth")
    response.headers["Cache-Control"] = "no-store"
    return {"name": user[1], "email": user[0]}


@router.get("/session")
def session(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    with connect() as db:
        user = db.execute("SELECT users.name, users.email FROM sessions JOIN users USING(email) WHERE token_hash = ? AND expires > ?", (token_hash(token), time.time())).fetchone()
    return {"name": user[0], "email": user[1]} if user else None


@router.post("/logout")
def logout(request: Request, response: Response):
    check_origin(request)
    token = request.cookies.get(COOKIE)
    if token:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
    response.delete_cookie(COOKIE, path="/auth", secure=settings.auth_cookie_secure, httponly=True, samesite="lax")
    return {"ok": True}
