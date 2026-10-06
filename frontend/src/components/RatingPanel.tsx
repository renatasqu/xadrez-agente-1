import { useEffect, useState } from "react";
import { api } from "../api";
import type { PlayerRating, RatingEvent } from "../types";

export function RatingPanel({ compact = false }: { compact?: boolean }) {
  const [rating, setRating] = useState<PlayerRating | null>(null);
  const [history, setHistory] = useState<RatingEvent[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const refresh = () => setAttempt(n => n + 1);
    window.addEventListener("xadrez:rating-updated", refresh);
    return () => window.removeEventListener("xadrez:rating-updated", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setError(false);
    Promise.all([api.rating(), api.ratingHistory()]).then(([value, events]) => {
      if (!value || typeof value.rating !== "number" || !Array.isArray(events)) throw new Error("Rating inválido");
      if (active) { setRating(value); setHistory(events); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);

  if (compact) {
    return (
      <div aria-label="Rating do Xadrez Multiagente" className="header-rating" title="Pontuação interna do Xadrez Multiagente. Não corresponde a rating FIDE.">
        <span className="header-rating-label">Rating</span>
        <strong>{rating?.rating ?? "—"}</strong>
        {error && <small role="status">Atualização indisponível</small>}
      </div>
    );
  }

  return <aside aria-label="Rating do Xadrez Multiagente" className="mx-auto max-w-3xl rounded border p-3 my-3">
    <p>Rating do Xadrez Multiagente: {rating?.rating ?? "—"}</p>
    <small>Pontuação interna do Xadrez Multiagente. Não corresponde a rating FIDE.</small>
    {error && <p role="status">Não foi possível atualizar o rating. <button onClick={() => setAttempt(n => n + 1)}>Tentar atualizar rating</button></p>}
    {rating && <p>{rating.games_rated} {rating.games_rated === 1 ? "partida avaliada" : "partidas avaliadas"}</p>}
    {history.length > 0 && <details><summary>Histórico de rating</summary><ul>{history.map(event => <li key={event.game_id}>
      {event.opponent_name ?? event.opponent_agent_id} · {({ win: "Vitória", draw: "Empate", loss: "Derrota" })[event.result]} · {event.delta > 0 ? "+" : ""}{event.delta} · {event.after}
    </li>)}</ul></details>}
  </aside>;
}
