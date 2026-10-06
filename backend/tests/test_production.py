"""Configuração de release e manutenção, apenas SQLite temporário."""
from contextlib import closing
import sqlite3
import pytest
from pydantic import ValidationError
from config import Settings, settings
from sqlite_backup import snapshot, verify
from tests.test_authorization import client
from tests.test_player_rating import fixture_game, reconcile
import games, progresso, main


def production(tmp_path, **changes):
    values=dict(app_env='production', cors_origens=['https://localhost:8443'],
                db_auth=tmp_path/'auth.sqlite', db_progresso=tmp_path/'data.sqlite',
                masters_cache_path=tmp_path/'masters.sqlite')
    values.update(changes)
    return Settings(_env_file=None, **values)


def test_production_defaults_and_development(tmp_path):
    p=production(tmp_path)
    assert p.auth_cookie_secure and not p.aquecer_na_inicializacao
    assert not Settings(_env_file=None).auth_cookie_secure
    assert p.stockfish_path=='stockfish'


@pytest.mark.parametrize('changes', [dict(auth_cookie_secure=False),dict(cors_origens=[]),
 dict(cors_origens=['*']),dict(cors_origens=['http://localhost:8443']),
 dict(cors_origens=['https://localhost:8443/path']),dict(db_auth='relative.sqlite'),
 dict(db_auth=None)])
def test_production_refuses_unsafe_config(tmp_path,changes):
    with pytest.raises(ValidationError):production(tmp_path,**changes)


def test_production_requires_explicit_paths():
    with pytest.raises(ValidationError):Settings(_env_file=None,app_env='production',cors_origens=['https://localhost:8443'])


def test_health_no_corpus_or_language(client,monkeypatch):
    monkeypatch.setattr(settings,'app_env','production')
    def forbidden():raise AssertionError('Health abriu Chroma')
    monkeypatch.setattr(main,'contar_indices',forbidden)
    result=client.get('/health')
    assert result.status_code==200 and result.json()['indices']=={}
    assert set(result.json())=={'status','stockfish','indices','chave_api','llm_provider'}


def test_backup_restore_game_rating_events_and_restart(client,tmp_path,monkeypatch):
    game=fixture_game();terminal=reconcile(game)
    source=settings.db_progresso
    with closing(progresso._conectar()) as db:
        before=db.execute('SELECT * FROM rating_events').fetchall()
        state=db.execute('SELECT * FROM player_ratings').fetchall()
    backup=tmp_path/'backup.sqlite';restored=tmp_path/'restored.sqlite'
    snapshot(source,backup);snapshot(backup,restored);verify(restored)
    assert backup.stat().st_mode & 0o777 == 0o600
    monkeypatch.setattr(settings,'db_progresso',restored)
    from fastapi.testclient import TestClient
    with TestClient(main.app):
        pass
    with TestClient(main.app):
        pass
    assert games.get_game(game.id,'a@example.com').moves==terminal.moves
    with closing(progresso._conectar()) as db:
        assert db.execute('SELECT * FROM rating_events').fetchall()==before
        assert db.execute('SELECT * FROM player_ratings').fetchall()==state
    assert reconcile(games.get_game(game.id,'a@example.com')).rating_change==terminal.rating_change
    with pytest.raises(ValueError):snapshot(source,backup)


def test_backup_wal_and_invalid_inputs(tmp_path):
    source=tmp_path/'source.sqlite';dest=tmp_path/'backup.sqlite'
    with closing(sqlite3.connect(source)) as db:
        db.execute('PRAGMA journal_mode=WAL');db.execute('CREATE TABLE value(n)')
        db.execute('INSERT INTO value VALUES (7)');db.commit()
        snapshot(source,dest)
        with closing(sqlite3.connect(dest)) as other:assert other.execute('SELECT n FROM value').fetchone()==(7,)
    corrupt=tmp_path/'corrupt.sqlite';corrupt.write_text('invalid')
    with pytest.raises(sqlite3.DatabaseError):snapshot(corrupt,tmp_path/'never.sqlite')
    assert not (tmp_path/'never.sqlite').exists()
    with pytest.raises(ValueError):snapshot(tmp_path/'missing',tmp_path/'other')
    link=tmp_path/'link';link.symlink_to(source)
    with pytest.raises(ValueError):snapshot(link,tmp_path/'other')


def test_unexpected_log_does_not_emit_secret(monkeypatch,caplog):
    import asyncio
    from starlette.requests import Request
    request=Request({'type':'http','method':'GET','path':'/health','headers':[]})
    response=asyncio.run(main.erro_inesperado(request,RuntimeError('PRIVATE_SENTINEL')))
    assert response.status_code==500 and 'RuntimeError' in caplog.text
    assert 'PRIVATE_SENTINEL' not in caplog.text and 'PRIVATE_SENTINEL' not in response.body.decode()


def test_https_cookie_cors_and_session(tmp_path,monkeypatch):
    import auth
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.testclient import TestClient
    config=production(tmp_path)
    for field in ('db_auth','auth_cookie_secure','cors_origens'):
        monkeypatch.setattr(settings,field,getattr(config,field))
    auth.configure_owner('qa@example.com','QA','password-test')
    app=FastAPI();app.include_router(auth.router)
    app.add_middleware(CORSMiddleware,allow_origins=config.cors_origens,allow_credentials=True,
                       allow_methods=['GET','POST'],allow_headers=['Content-Type'])
    with TestClient(app,base_url='https://localhost:8443') as https:
        headers={'Origin':'https://localhost:8443'}
        response=https.post('/auth/login',json={'email':'qa@example.com','password':'password-test'},headers=headers)
        cookie=next(x for x in response.headers.get_list('set-cookie') if 'Max-Age=604800' in x)
        assert all(x in cookie for x in ('Secure','HttpOnly','SameSite=lax','Path=/'))
        assert response.headers['access-control-allow-origin']==headers['Origin']
        assert response.headers['access-control-allow-credentials']=='true'
        assert https.get('/auth/session',headers=headers).json()['name']=='QA'
        denied=https.post('/auth/logout',headers={'Origin':'https://untrusted.invalid'})
        assert denied.status_code==403 and 'access-control-allow-origin' not in denied.headers
        assert https.get('/auth/session').json()['name']=='QA'
        assert https.post('/auth/logout',headers=headers).status_code==200
        assert https.get('/auth/session').json() is None


def test_production_http_error_is_sanitized(client,monkeypatch,caplog):
    from fastapi.testclient import TestClient
    monkeypatch.setattr(settings,'app_env','production')
    async def fail():raise RuntimeError('PRIVATE_HTTP_SENTINEL')
    main.app.add_api_route('/qa-production-error',fail)
    try:
        # raise_server_exceptions padrão prova que erro não escapa ao servidor.
        with TestClient(main.app) as app_client:
            response=app_client.get('/qa-production-error',headers={'Origin':'http://localhost:5173'})
        assert response.status_code==500
        assert response.headers['access-control-allow-origin']=='http://localhost:5173'
        assert 'PRIVATE_HTTP_SENTINEL' not in response.text+caplog.text
        assert 'RuntimeError' in caplog.text
    finally:
        main.app.router.routes.pop()


def test_startup_legacy_game_is_additive(client,tmp_path,monkeypatch):
    from datetime import datetime, timezone
    import uuid, chess
    from fastapi.testclient import TestClient
    legacy=tmp_path/'legacy.sqlite';game_id=str(uuid.uuid4());date=datetime.now(timezone.utc).isoformat()
    with closing(sqlite3.connect(legacy)) as db,db:
        db.execute('CREATE TABLE games (id TEXT PRIMARY KEY,owner TEXT,initial_fen TEXT,moves_json TEXT,human_color TEXT,agent_id TEXT,created_at TEXT,updated_at TEXT,version INTEGER)')
        db.execute('INSERT INTO games VALUES (?,?,?,?,?,?,?,?,?)',(game_id,'a@example.com',chess.STARTING_FEN,'["e2e4"]','white','stockfish',date,date,1))
        db.execute('CREATE TABLE licoes_cache (numero INTEGER PRIMARY KEY,conteudo_json TEXT NOT NULL)')
        db.execute('INSERT INTO licoes_cache VALUES (1,?)',('legacy-content',))
    monkeypatch.setattr(settings,'db_progresso',legacy)
    for _ in range(2):
        with TestClient(main.app):
            game=games.get_game(game_id,'a@example.com')
            assert game.moves==['e2e4'] and game.version==1 and game.opponent.profile_version==1
            with closing(progresso._conectar()) as db:
                assert db.execute('SELECT conteudo_json FROM licoes_cache').fetchone()[0]=='legacy-content'
                assert db.execute('SELECT COUNT(*) FROM rating_events').fetchone()[0]==0
