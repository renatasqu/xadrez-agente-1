"""Integração real de sessão/propriedade, sem LLM nem dados locais privados."""
import time
import sqlite3
import uuid
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

import auth
import main
import progresso
from config import settings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'db_auth', tmp_path / 'auth.sqlite')
    monkeypatch.setattr(settings, 'db_progresso', tmp_path / 'progress.sqlite')
    monkeypatch.setattr(settings, 'aquecer_na_inicializacao', False)
    monkeypatch.setattr(main, 'contar_indices', lambda: {})
    monkeypatch.setattr('masters.get_ratings', lambda: {'updated_at': None, 'masters': [], 'stale': True, 'source': 'FIDE'})
    main.app.dependency_overrides.clear()
    main.limiter.reset()
    auth.configure_owner('a@example.com', 'A', 'password-test')
    auth.configure_owner('b@example.com', 'B', 'password-test')
    with TestClient(main.app) as client:
        yield client
    main.app.dependency_overrides.clear()


def login(client, email='a@example.com'):
    response = client.post('/auth/login', json={'email': email, 'password': 'password-test'})
    assert response.status_code == 200
    return response


PRIVATE = [('POST', '/chat', {'mensagem': 'roque'}), ('POST', '/recomendar', {'mensagem': 'roque'}),
           ('POST', '/analisar', {'fen': 'invalid'}), ('POST', '/licao/proxima', {}),
           ('GET', '/licao/atual', None), ('GET', '/progresso/exercicios', None),
           ('GET', '/documentos/Laws_of_Chess-2023.pdf', None),
           ('GET', '/documentos/book.txt/contexto?chunk_id=x', None),
           ('GET', '/exercises/a1-cavalo', None),
           ('POST', '/exercises/a1-cavalo/validate', {'version': 1, 'action': {'type': 'move', 'source': 'b1', 'destination': 'c3'}}),
           ('POST', '/exercises/a1-cavalo/hint', {'version': 1, 'history': [], 'current_hint_level': 0})]


@pytest.mark.parametrize('method,path,body', PRIVATE)
def test_private_requires_session(client, method, path, body):
    assert client.request(method, path, json=body).status_code == 401


def test_session_lifecycle_and_cookie(client):
    response = login(client)
    cookies = response.headers.get_list('set-cookie')
    created = next(value for value in cookies if 'Max-Age=604800' in value)
    assert 'Path=/' in created and 'Path=/auth' not in created
    assert 'HttpOnly' in created and 'SameSite=lax' in created and 'Secure' not in created
    token = client.cookies[auth.COOKIE]
    assert client.get('/exercises/a1-cavalo').status_code == 200
    with closing(auth.connect()) as db, db:
        db.execute('UPDATE sessions SET expires = ?', (time.time() - 1,))
    assert client.get('/exercises/a1-cavalo').status_code == 401
    login(client)
    token = client.cookies[auth.COOKIE]
    response = client.post('/auth/logout')
    assert all('Max-Age=0' in c for c in response.headers.get_list('set-cookie'))
    client.cookies.set(auth.COOKIE, token, path='/')
    assert client.get('/exercises/a1-cavalo').status_code == 401


def test_secure_cookie(client, monkeypatch):
    monkeypatch.setattr(settings, 'auth_cookie_secure', True)
    assert 'Secure' in login(client).headers['set-cookie']


def test_public_and_admin(client):
    for path in ['/health', '/auth/session', '/masters/ratings', '/docs', '/redoc', '/openapi.json', '/docs/oauth2-redirect']:
        assert client.get(path).status_code == 200
    assert client.post('/auth/logout').status_code == 200
    # Baseline configuration keeps ingest disabled or requires an independent admin secret.
    assert client.post('/ingest').status_code in (403, 503)


def test_progress_ownership_and_legacy(client):
    login(client)
    action = {'version': 1, 'action': {'type': 'move', 'source': 'b1', 'destination': 'c3'}}
    assert client.post('/exercises/a1-cavalo/validate', json=action).status_code == 200
    identity = progresso.identidade('a@example.com')
    assert client.get('/progresso/exercicios').json()[0]['attempts'] == 1
    # New identity is stable across requests and authentication sessions.
    assert progresso.identidade('a@example.com') == identity
    client.post('/auth/logout')
    login(client, 'b@example.com')
    for method, path, body in [('GET', f'/progresso/exercicios?usuario_id={identity}', None),
                               ('GET', f'/licao/atual?usuario_id={identity}', None),
                               ('POST', '/licao/proxima', {'usuario_id': identity}),
                               ('POST', f'/exercises/a1-cavalo/validate?usuario_id={identity}', action)]:
        assert client.request(method, path, json=body).status_code == 403
    assert client.get('/progresso/exercicios').json() == []
    assert progresso.ler_exercicios(identity)[0]['attempts'] == 1
    legacy = str(uuid.uuid4())
    progresso.avancar(legacy, 1)
    assert client.get(f'/licao/atual?usuario_id={legacy}').status_code == 403
    assert progresso.proxima_licao(legacy) == 2
    progresso.associar_legado(legacy, 'a@example.com')
    assert client.get(f'/licao/atual?usuario_id={legacy}').status_code == 403
    assert progresso.identidade('a@example.com', legacy) == legacy
    assert progresso.identidade('a@example.com') == legacy
    with pytest.raises(sqlite3.IntegrityError):
        progresso.associar_legado(legacy, 'b@example.com')


def test_private_mutation_rejects_foreign_origin(client):
    login(client)
    assert client.post('/licao/proxima', headers={'Origin': 'https://foreign.example'}, json={}).status_code == 403


def test_forged_cookie_cannot_authorize(client):
    client.cookies.set(auth.COOKIE, 'forged-token', path='/')
    assert client.get('/exercises/a1-cavalo').status_code == 401


def test_concurrent_identity_and_additive_migration(client):
    from concurrent.futures import ThreadPoolExecutor
    legacy = str(uuid.uuid4())
    progresso.avancar(legacy, 1)
    progresso.registrar_exercicio(legacy, 'a1-cavalo', 'correct')
    progresso.criar_tabelas()
    progresso.criar_tabelas()
    assert progresso.proxima_licao(legacy) == 2
    assert progresso.ler_exercicios(legacy)[0]['attempts'] == 1
    with ThreadPoolExecutor(max_workers=4) as pool:
        identities = list(pool.map(lambda _: progresso.identidade('a@example.com'), range(8)))
    assert len(set(identities)) == 1
