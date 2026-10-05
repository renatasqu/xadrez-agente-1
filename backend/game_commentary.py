"""Comentário read-only de um lance oficial da IA; nenhum cálculo Stockfish."""
from typing import Literal, TYPE_CHECKING
import chess
from pydantic import BaseModel
import chess_engine
from agent_profiles import resolve_profile
from agent_personas import MoveFacts, resolve_persona, render_comment

if TYPE_CHECKING:
    from games import Game


class Commentary(BaseModel):
    game_id: str
    version: int
    ply: int
    profile_version: int
    persona_id: str
    persona_version: int
    facts: MoveFacts
    text: str
    status: Literal['available', 'fallback']


def commentary(game: 'Game', ply: int) -> Commentary:
    profile = resolve_profile(game.opponent.agent_id, game.opponent.profile_version)
    persona = resolve_persona(profile.persona_id, profile.persona_version)
    before = chess_engine.reconstruir_partida(game.initial_fen, game.moves[:ply-1])
    move = chess.Move.from_uci(game.moves[ply-1])
    after = before.copy(stack=True); after.push(move)
    state = chess_engine.estado_tabuleiro(after)
    facts = MoveFacts(move.uci(), before.san(move), before.is_capture(move), before.gives_check(move),
                      before.is_castling(move), bool(move.promotion), state['ended'], state['winner'])
    # A camada recebe somente valores frozen; não recebe Game/Board/policy/conexão.
    try:
        text = render_comment(persona, facts)
        if not isinstance(text, str) or not text.strip() or len(text) > 700:
            raise ValueError('Comentário inválido')
        status = 'available'
    except Exception:
        # Inclui timeout simulado. Template local não realiza I/O nem espera por serviço.
        text, status = f'Lance oficial: {facts.san}.', 'fallback'
    return Commentary(game_id=game.id, version=game.version, ply=ply, profile_version=profile.version,
                      persona_id=persona.id, persona_version=persona.version, facts=facts, text=text, status=status)
