import { useEffect, useState } from "react";
import { api } from "../api";
import type { Game, GameCommentary } from "../types";

export function AgentComment({ game }: { game: Game }) {
  const [comment, setComment] = useState<GameCommentary | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setComment(null);
    // Somente lance da IA já persistido; GET nunca decide nem executa movimento.
    const initialWhite = game.initial_fen.split(" ")[1] === "w";
    const humanWhite = game.human_color === "white";
    let ply = game.moves.length;
    if (ply && (ply % 2 === 1 ? initialWhite : !initialWhite) === humanWhite) ply--;
    if (!ply) { setLoading(false); return; }
    setLoading(true);
    api.gameCommentary(game.id, game.version, ply).then(value => {
      if (active && value.game_id === game.id && value.version === game.version && value.ply === ply
        && value.facts.uci === game.moves[ply-1] && typeof value.text === "string") setComment(value);
    }).catch(() => { /* comentário opcional: não interfere em movimento/retry */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [game.id, game.version, game.human_color, game.initial_fen]);
  return <aside aria-label="Comentário pedagógico" className="my-3 rounded border p-3">
    {loading ? <p role="status">Preparando comentário…</p> : comment ? <>
      <p>{comment.text}</p><small>Comentário local · Persona {comment.persona_id} v{comment.persona_version} · Lance {comment.ply}</small>
    </> : <p>Comentário pedagógico indisponível nesta posição.</p>}
  </aside>;
}
