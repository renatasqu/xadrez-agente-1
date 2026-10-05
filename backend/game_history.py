"""SAN/PGN/replay derivados e revisão local: nenhum dado derivado é persistido."""
from dataclasses import asdict
from threading import BoundedSemaphore
from datetime import datetime
from typing import TYPE_CHECKING, Literal
from pydantic import BaseModel
import chess
import chess.pgn
import chess_engine

if TYPE_CHECKING:
    from games import Game

class ReplayMove(BaseModel):
    ply: int
    move_number: int
    color: Literal['white', 'black']
    uci: str
    san: str
    fen: str


class Replay(BaseModel):
    game_id: str
    version: int
    initial_fen: str
    current_fen: str
    steps: list[ReplayMove]
    result: Literal['*', '1-0', '0-1', '1/2-1/2']
    termination: str


class Evaluation(BaseModel):
    fen: str
    lado: Literal['brancas', 'pretas']
    perspectiva: Literal['white']
    pontos: int | None
    mate: int | None
    melhor_lance: str | None
    melhor_lance_uci: str | None
    linha: list[str]
    linha_uci: list[str]
    profundidade: int | None
    status: str
    vencedor: Literal['white', 'black'] | None


class PlayedMove(BaseModel):
    uci: str
    san: str
    color: Literal['white', 'black']


class Review(BaseModel):
    game_id: str
    version: int
    ply: int
    played: PlayedMove | None
    before: Evaluation
    after: Evaluation
    cp_delta_white: int | None


_REVIEW_SLOTS = BoundedSemaphore(2)


def result(game: 'Game') -> str:
    if not game.terminal: return '*'
    return '1-0' if game.winner == 'white' else '0-1' if game.winner == 'black' else '1/2-1/2'


def replay(game: 'Game') -> dict:
    board = chess_engine.tabuleiro_validado(game.initial_fen)
    steps = []
    for ply, uci in enumerate(game.moves, 1):
        move = chess.Move.from_uci(uci)
        step = dict(ply=ply, move_number=board.fullmove_number, color='white' if board.turn else 'black', uci=uci, san=board.san(move))
        board.push(move)
        step['fen'] = board.fen()
        steps.append(step)
    return dict(game_id=game.id, version=game.version, initial_fen=game.initial_fen,
                current_fen=board.fen(), steps=steps, result=result(game), termination=game.status)


def pgn(game: 'Game') -> str:
    board = chess_engine.tabuleiro_validado(game.initial_fen)
    export = chess.pgn.Game()
    export.setup(board)
    opponent = game.profile['display_name'] if game.profile else 'AI'
    export.headers.update(Event='Xadrez Multiagente', Site='Local', Date=datetime.fromisoformat(game.created_at).strftime('%Y.%m.%d'),
                          White='Human' if game.human_color == 'white' else opponent,
                          Black='Human' if game.human_color == 'black' else opponent,
                          Result=result(game), Agent=game.opponent.agent_id, AgentProfile=opponent,
                          ProfileVersion=str(game.opponent.profile_version), HumanColor=game.human_color,
                          GameTermination=game.status)
    if game.profile and game.profile.get('persona'):
        persona = game.profile['persona']
        export.headers.update(PersonaId=persona['id'], PersonaVersion=str(persona['version']))
    node = export
    for uci in game.moves:
        move = chess.Move.from_uci(uci)
        node = node.add_variation(move)
    return export.accept(chess.pgn.StringExporter(headers=True, variations=False, comments=False)) + '\n'


def evaluate(board: chess.Board) -> dict:
    state = chess_engine.estado_tabuleiro(board)
    if state['ended']:
        value = chess_engine.Analise(fen=board.fen(), lado='brancas' if board.turn else 'pretas',
                                    status=state['status'], vencedor=state['winner'],
                                    mate=0 if state['status'] == 'checkmate' else None)
    else:
        def open_review_engine():
            motor = chess_engine.abrir_motor()
            motor.timeout = 5.0
            return motor
        value = chess_engine.analisar_posicao(board.fen(), .25, tabuleiro=board, abrir=open_review_engine)
    return asdict(value)


def review(game: 'Game', ply: int) -> dict:
    if not 0 <= ply <= len(game.moves):
        raise ValueError('Ply fora do histórico')
    before = chess_engine.reconstruir_partida(game.initial_fen, game.moves[:max(0, ply-1)])
    after = before.copy(stack=True)
    played = None
    if ply:
        move = chess.Move.from_uci(game.moves[ply-1])
        played = dict(uci=move.uci(), san=before.san(move), color='white' if before.turn else 'black')
        after.push(move)
    if not _REVIEW_SLOTS.acquire(timeout=1):
        raise TimeoutError('Revisão ocupada')
    try:
        first = evaluate(before)
        second = evaluate(after) if ply else first.copy()
    finally:
        _REVIEW_SLOTS.release()
    delta = second['pontos'] - first['pontos'] if first['mate'] is None and second['mate'] is None and first['pontos'] is not None and second['pontos'] is not None and ply else None
    return dict(game_id=game.id, version=game.version, ply=ply, played=played,
                before=first, after=second, cp_delta_white=delta)
