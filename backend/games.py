"""Partidas persistentes autoritativas. Policies escolhem candidatos; o servidor revalida e persiste."""
import json
import logging
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from typing import Literal, Protocol
from collections.abc import Awaitable, Callable

import chess
from fastapi import APIRouter, Depends, Request, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException
from starlette.responses import Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from auth import require_user
from chess_engine import reconstruir_partida, estado_tabuleiro
import progresso
from agent_profiles import PROFILES, resolve_profile
from game_history import Replay, Review
from game_commentary import Commentary

log = logging.getLogger(__name__)
Color = Literal['white', 'black']
GameStatus = Literal['playing', 'check', 'checkmate', 'stalemate', 'insufficient_material', 'repetition', 'fifty_move', 'draw']


class CreateGame(BaseModel):
    model_config = ConfigDict(extra='forbid')
    human_color: Color = 'white'
    agent_id: str = Field(default='stockfish', max_length=64)
    client_game_id: uuid.UUID | None = None


class HumanMove(BaseModel):
    model_config = ConfigDict(extra='forbid')
    move: str = Field(min_length=4, max_length=5)
    version: StrictInt = Field(ge=0)
    client_move_id: uuid.UUID


class Opponent(BaseModel):
    type: Literal['ai'] = 'ai'
    agent_id: str = 'stockfish'
    profile_version: int = 1


class Game(BaseModel):
    id: str
    initial_fen: str
    current_fen: str
    moves: list[str]
    human_color: Color
    side_to_move: Color
    status: GameStatus
    winner: Color | None
    terminal: bool
    awaiting_agent: bool
    opponent: Opponent
    profile: dict | None = None
    created_at: str
    updated_at: str
    version: int
    human_move: str | None = None
    agent_move: str | None = None
    agent_status: Literal['not_requested', 'pending', 'moved', 'error', 'superseded'] = 'not_requested'
    error: str | None = None


class AgentPolicy(Protocol):
    """Recebe cópia oficial; o servidor sempre revalida o candidato."""
    def choose_move(self, board: chess.Board, legal_moves: tuple[str, ...], config: Opponent) -> str: ...


class GameError(Exception):
    def __init__(self, code: str, message: str, status: int):
        self.code, self.message, self.status = code, message, status


def error_response(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({'code': code, 'message': message}, status_code=status,
                        headers={'Cache-Control': 'no-store'})


class GameRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        original = super().get_route_handler()

        async def handle(request: Request) -> Response:
            try:
                response = await original(request)
                response.headers['Cache-Control'] = 'no-store'
                return response
            except GameError as error:
                return error_response(error.code, error.message, error.status)
            except RequestValidationError:
                return error_response('invalid_request', 'Confira os campos da requisição.', 422)
            except HTTPException as error:
                code = 'unauthenticated' if error.status_code == 401 else 'forbidden'
                return error_response(code, 'Sessão ausente ou expirada.' if error.status_code == 401 else 'Requisição não autorizada.', error.status_code)
            except sqlite3.OperationalError:
                return error_response('storage_unavailable', 'Armazenamento temporariamente indisponível.', 503)
            except Exception as error:
                log.error('game_error: %s', type(error).__name__)
                return error_response('internal_error', 'Não foi possível processar a partida.', 500)
        return handle


def criar_tabelas() -> None:
    """Migração aditiva/idempotente no SQLite já utilizado pelo progresso."""
    with closing(progresso._conectar()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('''CREATE TABLE IF NOT EXISTS games (
            id TEXT PRIMARY KEY, owner TEXT NOT NULL, initial_fen TEXT NOT NULL,
            moves_json TEXT NOT NULL, human_color TEXT NOT NULL CHECK(human_color IN ('white','black')),
            agent_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0))''')
        columns = {row[1] for row in db.execute('PRAGMA table_info(games)')}
        if 'profile_version' not in columns:
            db.execute('ALTER TABLE games ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 1')
        db.execute('CREATE INDEX IF NOT EXISTS games_owner_updated ON games(owner, updated_at DESC, id DESC)')
        db.execute('''CREATE TABLE IF NOT EXISTS game_create_requests (
            owner TEXT NOT NULL, request_id TEXT NOT NULL, human_color TEXT NOT NULL,
            agent_id TEXT NOT NULL, game_id TEXT NOT NULL REFERENCES games(id),
            PRIMARY KEY(owner, request_id))''')
        db.execute('''CREATE TABLE IF NOT EXISTS game_move_requests (
            game_id TEXT NOT NULL REFERENCES games(id), request_id TEXT NOT NULL,
            move TEXT NOT NULL, expected_version INTEGER NOT NULL, response_json TEXT NOT NULL,
            PRIMARY KEY(game_id, request_id))''')


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def game_from_row(row: sqlite3.Row) -> Game:
    moves = json.loads(row['moves_json'])
    state = estado_tabuleiro(reconstruir_partida(row['initial_fen'], moves))
    try:
        profile = resolve_profile(row['agent_id'], row['profile_version']).metadata()
    except KeyError:
        profile = None
    return Game(profile=profile, id=row['id'], initial_fen=row['initial_fen'], current_fen=state['fen'], moves=moves,
                human_color=row['human_color'], side_to_move=state['turn'], status=state['status'],
                winner=state['winner'], terminal=state['ended'],
                awaiting_agent=not state['ended'] and state['turn'] != row['human_color'],
                opponent=Opponent(agent_id=row['agent_id'], profile_version=row['profile_version']), created_at=row['created_at'],
                updated_at=row['updated_at'], version=row['version'])


def owned_row(db: sqlite3.Connection, game_id: str, owner: str) -> sqlite3.Row:
    db.row_factory = sqlite3.Row
    row = db.execute('SELECT * FROM games WHERE id = ? AND owner = ?', (game_id, owner)).fetchone()
    if row is None:
        # Mesmo erro para ID inexistente ou de outra conta; evita enumeração.
        raise GameError('game_not_found', 'Partida não encontrada.', 404)
    return row


def create_or_reuse(owner: str, human_color: Color, *, client_game_id: uuid.UUID | None = None, agent_id: str = 'stockfish', initial_fen: str = chess.STARTING_FEN) -> tuple[Game, bool]:
    """FEN inicial é configuração interna; a API pública sempre cria posição padrão."""
    try:
        resolve_profile(agent_id)
    except KeyError:
        raise GameError('invalid_agent', 'Adversário desconhecido.', 422) from None
    reconstruir_partida(initial_fen, [])
    game_id, timestamp = str(uuid.uuid4()), now()
    with closing(progresso._conectar()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        if client_game_id is not None:
            previous = db.execute('SELECT human_color, agent_id, game_id FROM game_create_requests WHERE owner=? AND request_id=?', (owner, str(client_game_id))).fetchone()
            if previous:
                if previous[0] != human_color or previous[1] != agent_id:
                    raise GameError('duplicate_request_conflict', 'Chave de criação reutilizada com dados diferentes.', 409)
                return game_from_row(owned_row(db, previous[2], owner)), False
        db.execute('INSERT INTO games (id, owner, initial_fen, moves_json, human_color, agent_id, created_at, updated_at, version, profile_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)',
                   (game_id, owner, initial_fen, '[]', human_color, agent_id, timestamp, timestamp))
        if client_game_id is not None:
            db.execute('INSERT INTO game_create_requests VALUES (?, ?, ?, ?, ?)', (owner, str(client_game_id), human_color, agent_id, game_id))
        return game_from_row(owned_row(db, game_id, owner)), True


def create_game(owner: str, human_color: Color, *, agent_id: str = 'stockfish', initial_fen: str = chess.STARTING_FEN) -> Game:
    return create_or_reuse(owner, human_color, agent_id=agent_id, initial_fen=initial_fen)[0]


def get_game(game_id: str, owner: str) -> Game:
    with closing(progresso._conectar()) as db:
        return game_from_row(owned_row(db, game_id, owner))


def submit_human_move(game_id: str, owner: str, request: HumanMove) -> Game:
    with closing(progresso._conectar()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        row = owned_row(db, game_id, owner)
        key = str(request.client_move_id)
        previous = db.execute('SELECT * FROM game_move_requests WHERE game_id = ? AND request_id = ?', (game_id, key)).fetchone()
        if previous:
            if previous['move'] != request.move or previous['expected_version'] != request.version:
                raise GameError('duplicate_request', 'Chave de requisição reutilizada com dados diferentes.', 409)
            return Game.model_validate_json(previous['response_json'])
        game = game_from_row(row)
        if request.version != game.version:
            raise GameError('stale_game_version', 'Partida mudou. Consulte o estado atual.', 409)
        if game.terminal:
            raise GameError('game_finished', 'A partida já terminou.', 409)
        if game.awaiting_agent:
            raise GameError('not_human_turn', 'A partida aguarda o agente.', 409)
        try:
            reconstruir_partida(game.initial_fen, [*game.moves, request.move])
        except ValueError:
            raise GameError('invalid_move', 'Movimento ilegal na partida.', 422) from None
        updated = db.execute('UPDATE games SET moves_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
                   (json.dumps([*game.moves, request.move]), now(), game_id, game.version))
        if updated.rowcount != 1:
            raise GameError('stale_game_version', 'Partida mudou. Consulte o estado atual.', 409)
        result = game_from_row(owned_row(db, game_id, owner))
        result.human_move = request.move
        result.agent_status = 'pending' if result.awaiting_agent else 'not_requested'
        db.execute('INSERT INTO game_move_requests VALUES (?, ?, ?, ?, ?)',
                   (game_id, key, request.move, request.version, result.model_dump_json()))
        return result


def get_policy() -> AgentPolicy:
    from agent_policy import StockfishPolicy
    return StockfishPolicy()


def execute_agent(snapshot: Game, owner: str, policy: AgentPolicy) -> Game:
    """Calcule fora de qualquer conexão SQLite; CAS protege a aplicação posterior."""
    if snapshot.terminal:
        raise GameError('game_finished', 'A partida já terminou.', 409)
    if not snapshot.awaiting_agent:
        raise GameError('agent_not_expected', 'Agora é o turno humano.', 409)
    try:
        board = reconstruir_partida(snapshot.initial_fen, snapshot.moves)
        legal = tuple(move.uci() for move in board.legal_moves)
        candidate = policy.choose_move(board.copy(stack=True), legal, snapshot.opponent)
        # A policy pode alterar sua cópia. Sempre valide contra uma reconstrução nova.
        try:
            reconstruir_partida(snapshot.initial_fen, [*snapshot.moves, candidate])
        except (ValueError, TypeError, AttributeError):
            raise GameError('invalid_agent_move', 'O agente retornou um movimento inválido.', 503) from None
    except Exception as error:
        code = 'invalid_agent_move' if isinstance(error, GameError) and error.code == 'invalid_agent_move' else 'agent_timeout' if isinstance(error, TimeoutError) else 'agent_unavailable'
        try:
            current = get_game(snapshot.id, owner)
        except sqlite3.OperationalError:
            current = snapshot
        if current.version != snapshot.version:
            return current.model_copy(update=dict(human_move=snapshot.human_move, agent_status='superseded'))
        return current.model_copy(update=dict(human_move=snapshot.human_move, agent_status='error', error=code))
    with closing(progresso._conectar()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        current = game_from_row(owned_row(db, snapshot.id, owner))
        if current.version != snapshot.version or current.terminal or not current.awaiting_agent:
            return current.model_copy(update=dict(human_move=snapshot.human_move,
                agent_move=current.moves[-1] if current.version == snapshot.version + 1 else None,
                agent_status='moved' if current.version == snapshot.version + 1 else 'superseded'))
        # Revalidação no estado recarregado, sob a revisão esperada.
        reconstruir_partida(current.initial_fen, [*current.moves, candidate])
        updated = db.execute('UPDATE games SET moves_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
                            (json.dumps([*current.moves, candidate]), now(), current.id, current.version))
        if updated.rowcount != 1:
            raise GameError('stale_game_version', 'Partida mudou. Consulte o estado atual.', 409)
        return game_from_row(owned_row(db, current.id, owner)).model_copy(update=dict(
            human_move=snapshot.human_move, agent_move=candidate, agent_status='moved'))


class AgentMoveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    version: StrictInt = Field(ge=0)


router = APIRouter(prefix='/games', tags=['games'], route_class=GameRoute)


@router.post('', response_model=Game, status_code=201)
def create(data: CreateGame, user: dict = Depends(require_user), policy: AgentPolicy = Depends(get_policy)) -> Game:
    game, created = create_or_reuse(user['email'], data.human_color, agent_id=data.agent_id, client_game_id=data.client_game_id)
    return execute_agent(game, user['email'], policy) if created and game.awaiting_agent else game



class GameSummary(BaseModel):
    id: str
    human_color: Color
    opponent: Opponent
    profile: dict | None
    created_at: str
    updated_at: str
    status: GameStatus
    winner: Color | None
    terminal: bool
    side_to_move: Color
    awaiting_agent: bool
    move_count: int
    version: int


class GameList(BaseModel):
    games: list[GameSummary]
    next_offset: int | None


def list_games(owner: str, status: str, limit: int, offset: int) -> GameList:
    if status not in ('all', 'active', 'finished'):
        raise GameError('invalid_game_filter', 'Filtro de partidas inválido.', 422)
    if not 1 <= limit <= 50 or not 0 <= offset <= 10000:
        raise GameError('invalid_pagination', 'Limite deve ser 1–50 e offset 0–10000.', 422)
    results = []
    matched = 0
    with closing(progresso._conectar()) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute('SELECT * FROM games WHERE owner=? ORDER BY updated_at DESC, id DESC', (owner,))
        # Estado é derivado do histórico, sem duplicá-lo no banco. Leitura em streaming.
        for row in rows:
            game = game_from_row(row)
            if status == 'active' and game.terminal or status == 'finished' and not game.terminal:
                continue
            matched += 1
            if matched <= offset:
                continue
            try:
                profile = resolve_profile(game.opponent.agent_id, game.opponent.profile_version).metadata()
            except KeyError:
                profile = None
            results.append(GameSummary(**{**game.model_dump(), "profile": profile}, move_count=len(game.moves)))
            if len(results) > limit:
                break
    return GameList(games=results[:limit], next_offset=offset + limit if len(results) > limit and offset + limit <= 10000 else None)


@router.get('', response_model=GameList)
def listing(status: str = 'all', limit: int = Query(default=20), offset: int = Query(default=0), user: dict = Depends(require_user)) -> GameList:
    return list_games(user['email'], status, limit, offset)


@router.get('/{game_id}', response_model=Game)
def read(game_id: str, user: dict = Depends(require_user)) -> Game:
    return get_game(game_id, user['email'])


@router.post('/{game_id}/moves', response_model=Game)
def move(game_id: str, data: HumanMove, user: dict = Depends(require_user), policy: AgentPolicy = Depends(get_policy)) -> Game:
    result = submit_human_move(game_id, user['email'], data)
    if result.agent_status != 'pending':
        return result
    result = execute_agent(result, user['email'], policy)
    with closing(progresso._conectar()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        stored = db.execute('SELECT response_json FROM game_move_requests WHERE game_id=? AND request_id=?',
                            (game_id, str(data.client_move_id))).fetchone()
        acknowledgement = Game.model_validate_json(stored[0])
        if acknowledgement.agent_status != 'pending':
            return acknowledgement
        db.execute('UPDATE game_move_requests SET response_json = ? WHERE game_id = ? AND request_id = ?',
                   (result.model_dump_json(), game_id, str(data.client_move_id)))
    return result


@router.post('/{game_id}/agent-move', response_model=Game)
def agent_move(game_id: str, data: AgentMoveRequest, user: dict = Depends(require_user),
               policy: AgentPolicy = Depends(get_policy)) -> Game:
    snapshot = get_game(game_id, user['email'])
    if snapshot.version != data.version:
        raise GameError('stale_game_version', 'Partida mudou. Consulte o estado atual.', 409)
    return execute_agent(snapshot, user['email'], policy)


# Catálogo autenticado: somente metadados, sem caminhos/comandos/orçamentos UCI.
agents_router = APIRouter(tags=['agents'], route_class=GameRoute)


@agents_router.get('/agents')
def agents(user: dict = Depends(require_user)) -> list[dict]:
    return [profile.metadata() for profile in PROFILES.values()]


class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    ply: StrictInt = Field(ge=0)
    version: StrictInt = Field(ge=0)


@router.get('/{game_id}/replay', response_model=Replay)
def read_replay(game_id: str, user: dict = Depends(require_user)) -> dict:
    from game_history import replay
    return replay(get_game(game_id, user['email']))


@router.get('/{game_id}/pgn')
def export_pgn(game_id: str, user: dict = Depends(require_user)) -> Response:
    from game_history import pgn
    return Response(pgn(get_game(game_id, user['email'])), media_type='application/x-chess-pgn',
                    headers={'Content-Disposition': 'attachment; filename="partida.pgn"', 'X-Content-Type-Options': 'nosniff'})


@router.post('/{game_id}/review', response_model=Review)
def review_move(game_id: str, data: ReviewRequest, user: dict = Depends(require_user)) -> dict:
    from game_history import review
    from chess_engine import StockfishAusente, ErroDoMotor
    snapshot = get_game(game_id, user['email'])  # Conexão fechada antes do motor.
    if snapshot.version != data.version:
        raise GameError('stale_game_version', 'Partida mudou. Consulte o estado atual.', 409)
    if data.ply > len(snapshot.moves):
        raise GameError('invalid_ply', 'Lance fora do histórico.', 422)
    try:
        return review(snapshot, data.ply)
    except (StockfishAusente, ErroDoMotor, TimeoutError):
        raise GameError('review_unavailable', 'Não foi possível analisar este lance. Tente novamente.', 503) from None


@router.get('/{game_id}/commentary', response_model=Commentary)
def read_commentary(game_id: str, version: int = Query(ge=0), ply: int = Query(ge=1),
                    user: dict = Depends(require_user)) -> Commentary:
    from game_commentary import commentary
    snapshot = get_game(game_id, user['email'])
    if snapshot.version != version:
        raise GameError('stale_game_version', 'Partida mudou. Consulte o estado atual.', 409)
    if ply > len(snapshot.moves):
        raise GameError('invalid_ply', 'Lance fora do histórico.', 422)
    before = reconstruir_partida(snapshot.initial_fen, snapshot.moves[:ply-1])
    if ('white' if before.turn else 'black') == snapshot.human_color:
        raise GameError('not_agent_move', 'Este lance pertence ao humano.', 422)
    try:
        return commentary(snapshot, ply)
    except KeyError:
        raise GameError('persona_unavailable', 'Comentário indisponível para este perfil.', 503) from None
