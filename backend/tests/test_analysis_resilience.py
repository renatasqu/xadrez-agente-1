"""Fatos preservados diante de falhas opcionais, com sessão real na API."""
import time

import chess
import pytest
from fastapi.testclient import TestClient

from agents import analista
import chess_engine
import guardrails
import main
from config import settings
from llm import LLMNaoConfigurado
from schemas import RespostaAnalise
from tests.test_agentes import LLMFalso, trecho
from tests.test_authorization import client, login

INITIAL = chess.STARTING_FEN
MATE = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'


@pytest.fixture
def facts(monkeypatch):
    result = chess_engine.Analise(fen=MATE, lado='brancas', melhor_lance='Ra8#', linha=['Ra8#'],
        melhor_lance_uci='a1a8', linha_uci=['a1a8'], mate=1, profundidade=12,
        caracteristicas=['torre', 'xeque-mate'])
    monkeypatch.setattr(analista, 'analisar_posicao', lambda fen: result)
    return result


def fake_llm():
    return LLMFalso(RespostaAnalise(explicacao='A torre dá mate.', trechos_usados=[1],
                                  confianca=0.8, lances_mencionados=['Ra8#']))


def assert_facts(response, error):
    assert response.analise.status == 'available'
    assert response.analise.dados.mate == 1
    assert response.analise.dados.perspectiva == 'white'
    assert response.analise.dados.melhor_lance_uci == 'a1a8'
    assert response.analise.dados.linha_uci == ['a1a8']
    assert response.analise.explicacao_status == 'unavailable'
    assert response.analise.explicacao_erro == error
    assert response.confianca == 0 and response.onde_ler == []
    assert [f.documento for f in response.fontes] == ['stockfish']
    assert response.demonstracao.lances == ['Ra8#']
    assert 'Ra8#' in response.resposta and 'mate em 1 para as brancas' in response.resposta


@pytest.mark.parametrize('error', [LLMNaoConfigurado('secret-key'), TimeoutError('secret-token'),
                                   RuntimeError('private-provider-data')])
def test_llm_creation_failure_preserves_facts(facts, monkeypatch, caplog, error):
    def fail(**kwargs):
        raise error
    monkeypatch.setattr(analista, 'criar_llm', fail)
    monkeypatch.setattr(analista, 'buscar', lambda *a: pytest.fail('must not retrieve without LLM'))
    result = analista.responder('Analise', MATE)
    assert_facts(result, 'llm_error')
    assert 'llm_error' in caplog.text and str(error) not in caplog.text


@pytest.mark.parametrize('error', [TimeoutError('private-timeout'), RuntimeError('model unavailable')])
def test_provider_failure_preserves_facts(facts, monkeypatch, caplog, error):
    monkeypatch.setattr(analista, 'buscar', lambda *a: [trecho(1)])
    def fail(*args):
        raise error
    monkeypatch.setattr(analista, 'chamar_estruturado', fail)
    assert_facts(analista.responder('Analise', MATE, llm=fake_llm()), 'llm_error')
    assert str(error) not in caplog.text


@pytest.mark.parametrize('error', [RuntimeError('collection absent'), OSError('embeddings unavailable')])
def test_retrieval_failure_preserves_facts_and_invents_no_sources(facts, monkeypatch, caplog, error):
    def fail(*args):
        raise error
    monkeypatch.setattr(analista, 'buscar', fail)
    llm = fake_llm()
    assert_facts(analista.responder('Analise', MATE, llm=llm), 'retrieval_error')
    assert llm.chamadas == [] and 'retrieval_error' in caplog.text
    assert str(error) not in caplog.text


def test_recommendation_embedding_failure_preserves_facts(facts, monkeypatch):
    monkeypatch.setattr(analista, 'buscar', lambda *a: [trecho(1)])
    def fail(*args):
        raise OSError('embedding')
    monkeypatch.setattr(analista.onde_ler, 'recomendar', fail)
    assert_facts(analista.responder('Analise', MATE, llm=fake_llm()), 'retrieval_error')


def test_guardrail_rejects_only_explanation_preserving_engine(facts, monkeypatch):
    monkeypatch.setattr(analista, 'buscar', lambda *a: [trecho(1)])
    llm = LLMFalso(RespostaAnalise(explicacao='<fatos_do_motor> leak', trechos_usados=[1],
                                 confianca=0.9, lances_mencionados=[]))
    result = analista.responder('Analise', MATE, llm=llm)
    assert_facts(result, 'explanation_unavailable')
    assert 'leak' not in result.resposta


def test_api_success_and_legacy_text_remain_compatible(client, facts, monkeypatch):
    login(client)
    monkeypatch.setattr(analista, 'buscar', lambda *a: [trecho(1)])
    main.app.dependency_overrides[main.obter_llms] = lambda: main.LLMs(agente=fake_llm())
    response = client.post('/analisar', json={'fen': MATE})
    assert response.status_code == 200
    body = response.json()
    assert body['analise']['status'] == 'available'
    assert body['analise']['explicacao_status'] == 'available'
    assert body['analise']['dados']['tipo_avaliacao'] == 'mate'
    assert 'Melhor lance para as brancas: Ra8#' in body['resposta']
    assert 'A torre dá mate.' in body['resposta']
    assert len(body['fontes']) == 2 and body['demonstracao']['lances'] == ['Ra8#']


def test_api_without_llm_preserves_facts(client, facts, monkeypatch):
    login(client)
    monkeypatch.setattr(settings, 'llm_provider', 'anthropic')
    monkeypatch.setattr(settings, 'anthropic_api_key', '')
    response = client.post('/analisar', json={'fen': MATE})
    assert response.status_code == 200
    from schemas import Resposta
    assert_facts(Resposta.model_validate(response.json()), 'llm_error')


def test_api_invalid_fen_distinguished_from_engine_failure(client, monkeypatch):
    login(client)
    body = client.post('/analisar', json={'fen': 'invalid'}).json()
    assert body['analise']['status'] == 'invalid_position'
    assert body['analise']['dados'] is None
    def fail(*args):
        raise chess_engine.ErroDoMotor('private engine detail')
    monkeypatch.setattr(analista, 'analisar_posicao', fail)
    body = client.post('/analisar', json={'fen': INITIAL}).json()
    assert body['analise']['status'] == 'engine_error' and body['analise']['dados'] is None
    assert 'private engine detail' not in str(body)
    assert body['analise']['explicacao_status'] == 'not_applicable'


def test_api_still_requires_real_session(client, facts):
    assert client.post('/analisar', json={'fen': MATE}).status_code == 401


def test_timeout_returns_preserved_snapshot(client, facts, monkeypatch):
    login(client)
    monkeypatch.setattr(settings, 'timeout_requisicao', 0.03)
    monkeypatch.setattr(analista, 'buscar', lambda *a: [trecho(1)])
    main.app.dependency_overrides[main.obter_llms] = lambda: main.LLMs(agente=fake_llm())
    original = analista.enriquecer_resposta
    def slow(*args):
        time.sleep(0.08)  # bounded; no permanent worker/process
        return original(*args)
    monkeypatch.setattr(analista, 'enriquecer_resposta', slow)
    response = client.post('/analisar', json={'fen': MATE})
    assert response.status_code == 200
    from schemas import Resposta
    snapshot = Resposta.model_validate(response.json())
    assert_facts(snapshot, 'explanation_timeout')
    time.sleep(0.1)
    assert snapshot.analise.explicacao_status == 'unavailable'
    assert len(snapshot.fontes) == 1


def test_ingestion_blocks_only_explanation(client, facts):
    login(client)
    main.ingerindo.set()
    try:
        response = client.post('/analisar', json={'fen': MATE})
    finally:
        main.ingerindo.clear()
    from schemas import Resposta
    assert response.status_code == 200
    assert_facts(Resposta.model_validate(response.json()), 'retrieval_error')


def test_warmup_failure_keeps_authenticated_engine_access(client, facts, monkeypatch, caplog):
    monkeypatch.setattr(settings, 'aquecer_na_inicializacao', True)
    def fail():
        raise OSError('private model path')
    monkeypatch.setattr(main, 'aquecer', fail)
    with TestClient(main.app) as started:
        login(started)
        body = started.post('/analisar', json={'fen': MATE}).json()
        assert body['analise']['status'] == 'available'
    assert 'retrieval_error: warmup OSError' in caplog.text
    assert 'private model path' not in caplog.text


@pytest.mark.skipif(chess_engine.caminho_do_stockfish() is None, reason='Stockfish não instalado')
def test_real_stockfish_endpoint_without_language_or_corpus(client, monkeypatch):
    login(client)
    monkeypatch.setattr(settings, 'stockfish_tempo', 0.05)
    monkeypatch.setattr(settings, 'llm_provider', 'anthropic')
    monkeypatch.setattr(settings, 'anthropic_api_key', '')
    monkeypatch.setattr(analista, 'buscar', lambda *args: pytest.fail('No corpus needed'))
    body = client.post('/analisar', json={'fen': INITIAL}).json()
    result = body['analise']['dados']
    assert result['tipo_avaliacao'] == 'centipawn' and type(result['pontos']) is int
    assert result['perspectiva'] == 'white' and type(result['profundidade']) is int
    chess_engine.movimento_legal(INITIAL, result['melhor_lance_uci'])
    assert body['analise']['explicacao_erro'] == 'llm_error'
    assert [f['documento'] for f in body['fontes']] == ['stockfish']


def test_judge_failure_is_explicit_and_preserves_engine(facts, monkeypatch):
    monkeypatch.setattr(settings, 'verificar_fundamentacao', True)
    monkeypatch.setattr(analista, 'buscar', lambda *a: [trecho(1)])
    monkeypatch.setattr(guardrails, 'verificar_fundamentacao', lambda *a: None)
    assert_facts(analista.responder('Analise', MATE, llm=fake_llm(), llm_juiz=fake_llm()), 'llm_error')


def test_api_terminal_position_needs_neither_motor_nor_explanation(client, monkeypatch):
    login(client)
    monkeypatch.setattr(analista, 'abrir_motor', lambda: pytest.fail('terminal opens no process'))
    monkeypatch.setattr(analista, 'criar_llm', lambda **kwargs: pytest.fail('terminal needs no language'))
    body = client.post('/analisar', json={'fen': '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'}).json()
    assert body['analise']['status'] == 'available'
    assert body['analise']['dados']['status'] == 'stalemate'
    assert body['analise']['explicacao_status'] == 'not_applicable'
    assert body['fontes'] == [] and body['analise']['dados']['tipo_avaliacao'] is None


@pytest.mark.parametrize('output', [None, RespostaAnalise(explicacao='A torre dá mate.', trechos_usados=[1],
    confianca=float('nan'), lances_mencionados=['Ra8#'])])
def test_malformed_language_output_preserves_facts(facts, monkeypatch, output):
    monkeypatch.setattr(analista, 'buscar', lambda *a: [trecho(1)])
    monkeypatch.setattr(analista, 'chamar_estruturado', lambda *a: output)
    assert_facts(analista.responder('Analise', MATE, llm=fake_llm()), 'llm_error')
