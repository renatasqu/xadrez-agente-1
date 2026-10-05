import time
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from auth import router, limiter, configure_owner, connect, COOKIE
from config import settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'db_auth', tmp_path / 'auth.sqlite')
    limiter.reset()
    app = FastAPI()
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.include_router(router)
    configure_owner('owner@example.com', 'Owner', 'test-password-only')
    return TestClient(app)


def login(client, password='test-password-only', email='owner@example.com'):
    return client.post('/auth/login', json={'email': email, 'password': password})


def test_password_and_session_lifecycle(client):
    assert client.get('/auth/session').json() is None
    assert login(client, 'wrong').status_code == 401
    assert login(client, email='other@example.com').status_code == 401
    response = login(client, email=' OWNER@example.com ')
    assert response.status_code == 200
    assert response.json() == {'name': 'Owner', 'email': 'owner@example.com'}
    assert 'HttpOnly' in response.headers['set-cookie']
    assert 'SameSite=lax' in response.headers['set-cookie']
    assert client.get('/auth/session').json()['name'] == 'Owner'
    with connect() as db:
        row = db.execute('SELECT password_hash FROM users').fetchone()
        assert row[0] != 'test-password-only'
        token = db.execute('SELECT token_hash FROM sessions').fetchone()[0]
        assert token != client.cookies[COOKIE]
    assert client.post('/auth/logout').status_code == 200
    assert client.get('/auth/session').json() is None


def test_expired_and_forged_sessions(client):
    login(client)
    with connect() as db:
        db.execute('UPDATE sessions SET expires = ?', (time.time() - 1,))
    assert client.get('/auth/session').json() is None
    client.cookies.clear()
    client.cookies.set(COOKIE, 'forged', path='/auth')
    assert client.get('/auth/session').json() is None


def test_rate_limit(client):
    for _ in range(5):
        assert login(client, 'wrong').status_code == 401
    assert login(client, 'wrong').status_code == 429


def test_rejects_untrusted_origin_and_public_registration(client):
    response = client.post('/auth/login', headers={'Origin': 'https://untrusted.example'}, json={'email': 'owner@example.com', 'password': 'test-password-only'})
    assert response.status_code == 403
    assert client.post('/auth/register', json={}).status_code == 404
