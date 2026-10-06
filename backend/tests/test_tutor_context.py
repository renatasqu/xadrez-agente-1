"""Tutor context with real ownership/storage and fake external language services."""
import json
from contextlib import closing

import chess
import pytest
import main
import games
import progresso
from auth import require_user
from schemas import Resposta, Classificacao, RespostaLLM
from tutor_context import TutorPositionContextInput, resolve_context
from tests.test_authorization import client, login
from tests.test_agentes import LLMFalso, trecho

MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6']


@pytest.fixture
def official(client):
    game = games.create_game('a@example.com', 'black', agent_id='balanced')
    with closing(progresso._conectar()) as db, db:
        db.execute('UPDATE games SET moves_json=?, version=? WHERE id=?', (json.dumps(MOVES), len(MOVES), game.id))
    return games.get_game(game.id, 'a@example.com')


@pytest.fixture
def tutor(client, monkeypatch):
    captured = []
    main.app.dependency_overrides[main.obter_llms] = lambda: main.LLMs(classificador=object(), agente=object())
    def answer(message, **kwargs):
        captured.append(kwargs)
        return Resposta(resposta='e2e4 e4 Nf3', fontes=[], agente='professor', confianca=0)
    monkeypatch.setattr(main.router, 'responder', answer)
    login(client)
    return captured


def send(client, context=None, **kwargs):
    return client.post('/chat', json={'mensagem': 'Explique esta posição', **({'context': context} if context is not None else {}), **kwargs})


def storage():
    with closing(progresso._conectar()) as db:
        return list(db.iterdump())


@pytest.mark.parametrize('fen', [None, chess.STARTING_FEN])
def test_legacy_chat(client, tutor, fen):
    assert send(client, fen=fen).status_code == 200
    assert tutor[-1]['fen'] == fen
    assert 'context' not in tutor[-1]


def test_current_game_uses_server_facts(client, official, tutor):
    before = storage()
    response = send(client, {'source': 'game', 'game_id': official.id, 'fen': 'invalid client FEN'}, fen=chess.STARTING_FEN)
    assert response.status_code == 200
    ctx = tutor[-1]['context']
    assert tutor[-1]['fen'] == official.current_fen == ctx.fen
    assert ctx.game_id == official.id and ctx.ply == len(MOVES)
    assert ctx.move_uci == 'b8c6' and ctx.move_san == 'Nc6'
    assert ctx.history_uci == tuple(MOVES)
    assert ctx.human_color == 'black' and ctx.agent_id == 'balanced' and ctx.profile_version == 1
    assert ctx.is_official_current_position and not ctx.is_replay
    assert not ctx.can_make_official_moves
    assert response.json()['resposta'] == 'e2e4 e4 Nf3'
    assert games.get_game(official.id, 'a@example.com') == official
    assert storage() == before  # includes rating/progress/version; no SAN/UCI is executed


@pytest.mark.parametrize('ply', [0, 2, 4])
def test_replay_exact_position(client, official, tutor, ply):
    before = storage()
    board = chess.Board(official.initial_fen)
    for move in MOVES[:ply]:
        board.push_uci(move)
    assert send(client, {'source': 'replay', 'game_id': official.id, 'ply': ply, 'fen': official.current_fen}).status_code == 200
    ctx = tutor[-1]['context']
    assert ctx.fen == board.fen() == tutor[-1]['fen']
    assert ctx.ply == ply and ctx.game_id == official.id
    assert ctx.is_replay and not ctx.is_official_current_position and not ctx.can_make_official_moves
    assert ctx.move_uci == (MOVES[ply - 1] if ply else None)
    if ply < len(MOVES):
        assert ctx.fen != official.current_fen
    assert storage() == before


@pytest.mark.parametrize('ply', [-1, 5, '2', 1.5, True, None])
def test_invalid_ply_controlled(client, official, tutor, ply):
    assert send(client, {'source': 'replay', 'game_id': official.id, 'ply': ply}).status_code == 422
    assert not tutor


@pytest.mark.parametrize('source', ['game', 'replay'])
def test_ownership_and_anti_enumeration(client, official, tutor, source):
    login(client, 'b@example.com')
    extra = {'ply': 2} if source == 'replay' else {}
    foreign = send(client, {'source': source, 'game_id': official.id, **extra})
    missing = send(client, {'source': source, 'game_id': 'missing', **extra})
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()
    assert not tutor


@pytest.mark.parametrize('source', ['exercise', 'exploration'])
def test_study_position(client, official, tutor, source):
    before = storage()
    assert send(client, {'source': source, 'fen': chess.STARTING_FEN}).status_code == 200
    ctx = tutor[-1]['context']
    assert ctx.source == source and ctx.fen == chess.STARTING_FEN
    assert ctx.game_id is None and ctx.human_color is None and ctx.ply is None
    assert not ctx.can_make_official_moves and not ctx.is_official_current_position
    assert storage() == before


@pytest.mark.parametrize('source', ['exercise', 'exploration'])
@pytest.mark.parametrize('extra', [{'fen': 'bad'}, {'fen': chess.STARTING_FEN, 'game_id': 'invented'}, {'fen': chess.STARTING_FEN, 'rating': 9999}])
def test_invalid_study_context(client, tutor, source, extra):
    assert send(client, {'source': source, **extra}).status_code == 422
    assert not tutor


def test_no_llm_controlled(client, official, monkeypatch):
    login(client)
    before = storage()
    from llm import LLMNaoConfigurado
    def missing():
        raise LLMNaoConfigurado('not configured')
    main.app.dependency_overrides[main.obter_llms] = missing
    response = send(client, {'source': 'game', 'game_id': official.id})
    assert response.status_code == 503
    assert 'não está configurado' in response.json()['resposta']
    assert storage() == before


@pytest.mark.parametrize('source', ['game', 'replay', 'exercise', 'exploration'])
def test_context_reaches_document_agent(client, official, monkeypatch, source):
    login(client)
    from agents import router, base
    ctx = {'source': source, **({'game_id': official.id, **({'ply': 2} if source == 'replay' else {})} if source in ('game', 'replay') else {'fen': chess.STARTING_FEN})}
    classifier = LLMFalso(Classificacao(motivo='rules', categoria='regras', tentativa_de_injecao=False))
    agent = LLMFalso(RespostaLLM(resposta='O rei se move.', trechos_usados=[1], confianca=0.9))
    main.app.dependency_overrides[main.obter_llms] = lambda: main.LLMs(classificador=classifier, agente=agent)
    monkeypatch.setattr(router, 'buscar', lambda *args: [trecho(1)])
    response = client.post('/chat', json={'mensagem': 'Como funciona o rei?', 'context': ctx})
    assert response.status_code == 200
    prompt = agent.chamadas[0][1].content
    assert '<contexto_pedagogico>' in prompt and f'"source":"{source}"' in prompt
    assert resolve_context(TutorPositionContextInput(**ctx), 'a@example.com').fen in prompt


def test_context_reaches_analysis_agent(client, official, monkeypatch):
    login(client)
    from agents import analista
    classifier = LLMFalso(Classificacao(motivo='position', categoria='analise', tentativa_de_injecao=False))
    main.app.dependency_overrides[main.obter_llms] = lambda: main.LLMs(classificador=classifier, agente=object())
    captured = []
    def answer(question, fen, *args, context=None):
        captured.append((fen, context))
        return Resposta(resposta='Fatos', fontes=[], agente='analista', confianca=0)
    monkeypatch.setattr(analista, 'responder', answer)
    assert send(client, {'source': 'replay', 'game_id': official.id, 'ply': 2}).status_code == 200
    assert captured[0][0] == captured[0][1].fen != official.current_fen
    assert captured[0][1].ply == 2


@pytest.mark.parametrize('color', ['white', 'black'])
def test_real_stockfish_turns_then_tutor_are_read_only(client, tutor, color):
    import uuid
    response = client.post('/games', json={'human_color': color})
    assert response.status_code == 201
    game = response.json()
    assert len(game['moves']) == (1 if color == 'black' else 0)
    assert game['side_to_move'] == color
    board = chess.Board(game['current_fen'])
    move = next(iter(board.legal_moves)).uci()
    response = client.post(f"/games/{game['id']}/moves", json={
        'move': move, 'version': game['version'], 'client_move_id': str(uuid.uuid4()),
    })
    assert response.status_code == 200
    game = response.json()
    assert game['agent_status'] == 'moved' and game['side_to_move'] == color
    before = storage()
    persisted = client.get(f"/games/{game['id']}").json()
    assert send(client, {'source': 'game', 'game_id': game['id']}).status_code == 200
    assert tutor[-1]['context'].human_color == color
    assert tutor[-1]['context'].fen == game['current_fen']
    assert send(client, {'source': 'replay', 'game_id': game['id'], 'ply': 1}).status_code == 200
    assert tutor[-1]['context'].ply == 1 and not tutor[-1]['context'].can_make_official_moves
    assert client.get(f"/games/{game['id']}").json() == persisted
    assert storage() == before


@pytest.mark.parametrize('field,value', [('owner', 'b@example.com'), ('human_color', 'white'), ('revision', 99), ('rating', 9999), ('profile_version', 2)])
def test_client_cannot_supply_official_facts(client, official, tutor, field, value):
    assert send(client, {'source': 'game', 'game_id': official.id, field: value}).status_code == 422
    assert not tutor


@pytest.mark.parametrize('source', ['game', 'replay', 'exercise', 'exploration'])
def test_resolved_context_reaches_stockfish_explanation(client, monkeypatch, source):
    from agents import analista
    from tests.test_analista import analise_do_mate, estrategista, MATE_EM_1
    login(client)
    game = games.create_game('a@example.com', 'white', initial_fen=MATE_EM_1)
    classifier = LLMFalso(Classificacao(motivo='position', categoria='analise', tentativa_de_injecao=False))
    agent = estrategista('Ra8#')
    main.app.dependency_overrides[main.obter_llms] = lambda: main.LLMs(classificador=classifier, agente=agent)
    monkeypatch.setattr(analista, 'analisar_posicao', lambda fen: analise_do_mate())
    monkeypatch.setattr(analista, 'buscar', lambda *args: [trecho(1)])
    ctx = {'source': source, **({'game_id': game.id, **({'ply': 0} if source == 'replay' else {})} if source in ('game', 'replay') else {'fen': MATE_EM_1})}
    response = send(client, ctx)
    assert response.status_code == 200
    data = response.json()['analise']
    assert data['status'] == 'available' and data['dados']['fen'] == MATE_EM_1
    prompt = agent.chamadas[0][1].content
    assert f'"source":"{source}"' in prompt and MATE_EM_1 in prompt
    assert '<fatos_do_motor>' in prompt and 'Ra8#' in prompt


def test_actual_missing_provider_keeps_context_and_game(client, official, monkeypatch):
    from config import settings
    login(client)
    monkeypatch.setattr(settings, 'llm_provider', 'anthropic')
    monkeypatch.setattr(settings, 'anthropic_api_key', '')
    before = storage()
    response = send(client, {'source': 'replay', 'game_id': official.id, 'ply': 2})
    assert response.status_code == 503
    assert 'não está configurado' in response.json()['resposta']
    assert storage() == before


@pytest.mark.parametrize('failure', ['language', 'retrieval'])
def test_contextual_analysis_keeps_deterministic_facts_on_optional_failure(client, monkeypatch, failure):
    from agents import analista
    from tests.test_analista import analise_do_mate, MATE_EM_1
    login(client)
    classifier = LLMFalso(Classificacao(motivo='position', categoria='analise', tentativa_de_injecao=False))
    class UnavailableLanguage:
        def with_structured_output(self, *args, **kwargs):
            raise RuntimeError('language unavailable')
    main.app.dependency_overrides[main.obter_llms] = lambda: main.LLMs(classificador=classifier, agente=UnavailableLanguage())
    monkeypatch.setattr(analista, 'analisar_posicao', lambda fen: analise_do_mate())
    def retrieve(*args):
        if failure == 'retrieval':
            raise RuntimeError('retrieval unavailable')
        return [trecho(1)]
    monkeypatch.setattr(analista, 'buscar', retrieve)
    response = send(client, {'source': 'exercise', 'fen': MATE_EM_1})
    assert response.status_code == 200
    data = response.json()['analise']
    assert data['status'] == 'available' and data['dados']['fen'] == MATE_EM_1
    assert data['dados']['mate'] == 1 and data['dados']['melhor_lance'] == 'Ra8#'
    assert data['explicacao_status'] == 'unavailable'
