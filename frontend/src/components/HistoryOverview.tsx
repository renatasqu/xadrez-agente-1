import { useEffect, useState } from "react";
import { api } from "../api";
import type { GameList } from "../types";

/** Apresentação mínima; abertura e filtros permanecem no AiGame nesta etapa. */
export function HistoryOverview() {
  const [list, setList] = useState<GameList | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    api.listGames().then(value => { if (active) setList(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  return <>
    <h2>Histórico</h2><p>Partidas salvas na sua conta.</p>
    {error ? <p role="alert">Não foi possível consultar as partidas salvas. Tente novamente ao abrir Histórico.</p>
      : !list ? <p role="status">Carregando partidas…</p>
      : list.games.length === 0 ? <p>Nenhuma partida salva.</p>
      : <ul>{list.games.map(game => <li key={game.id}>
        <strong>{game.profile?.display_name ?? game.opponent.agent_id}</strong>
        {` · Você: ${game.human_color === "white" ? "brancas" : "pretas"} · ${game.terminal ? "Encerrada" : "Em andamento"} · ${game.move_count} lances`}
      </li>)}</ul>}
    {list?.next_offset !== null && list?.next_offset !== undefined && <p>Há mais partidas na lista disponível em Partida.</p>}
    <p>Para abrir uma partida, use a lista de partidas salvas na configuração de Partida.</p>
    <a className="botao-pixel" href="#/partida">Voltar à Partida</a>
  </>;
}
