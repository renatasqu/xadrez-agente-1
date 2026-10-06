import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { GameList, GameSummary } from "../types";

type Filter = "all" | "active" | "finished";
const filterNames: Record<Filter, string> = { all: "Todas", active: "Em andamento", finished: "Finalizadas" };
const reasons: Partial<Record<GameSummary["status"], string>> = {
  checkmate: "Xeque-mate", stalemate: "Afogamento", insufficient_material: "Material insuficiente",
  repetition: "Repetição", fifty_move: "Regra dos 50 lances", draw: "Empate",
};
function result(game: GameSummary) {
  if (!game.terminal) return "Em andamento";
  if (game.winner) return game.winner === game.human_color ? "Vitória" : "Derrota";
  if (["stalemate", "insufficient_material", "repetition", "fifty_move", "draw"].includes(game.status)) return "Empate";
  return null;
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Consulta resumos; somente a abertura explícita carrega uma Game completa. */
export function HistoryOverview({ onOpen }: { onOpen: (id: string, review: boolean) => Promise<void> }) {
  const [query, setQuery] = useState({ filter: "all" as Filter, offset: 0, attempt: 0 });
  const [data, setData] = useState<(GameList & { filter: Filter; offset: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const openLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(false);
    api.listGames(query.filter, query.offset).then(value => {
      if (!active) return;
      if (!value || !Array.isArray(value.games)) throw new Error("Lista inválida");
      const ids = new Set<string>();
      const games = value.games.filter(game => { if (ids.has(game.id)) return false; ids.add(game.id); return true; });
      setData({ ...value, games, filter: query.filter, offset: query.offset });
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);
  async function open(game: GameSummary, review: boolean) {
    if (openLock.current) return;
    openLock.current = true; setOpeningId(game.id); setOpenError(null);
    try { await onOpen(game.id, review); }
    catch { if (mounted.current) setOpenError("Não foi possível abrir esta partida. Aguarde qualquer operação em andamento e tente novamente."); }
    finally { openLock.current = false; if (mounted.current) setOpeningId(null); }
  }
  const activeCount = data?.games.filter(game => !game.terminal).length ?? 0;
  const finishedCount = (data?.games.length ?? 0) - activeCount;
  return <div className="game-archive">
    <header className="archive-heading"><div><h2>Histórico</h2><p>Suas partidas contra os agentes.</p></div><a className="botao-pixel archive-new" href="#/partida">Nova partida</a></header>
    {data && <p className="archive-summary" aria-label="Resumo da página">Nesta página: {data.games.length} {data.games.length === 1 ? "partida" : "partidas"} · {activeCount} em andamento · {finishedCount} {finishedCount === 1 ? "finalizada" : "finalizadas"}</p>}
    <div className="archive-toolbar">
      <label>Mostrar<select aria-label="Filtrar partidas" value={query.filter} disabled={openingId !== null} onChange={event => setQuery({ filter: event.target.value as Filter, offset: 0, attempt: 0 })}>
        <option value="all">Todas</option><option value="active">Em andamento</option><option value="finished">Finalizadas</option>
      </select></label>
      <button type="button" disabled={loading || openingId !== null} onClick={() => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Atualizar partidas</button>
    </div>
    {loading && <p role="status">Carregando partidas…</p>}
    {error && <p role="alert">Não foi possível carregar as partidas. <button type="button" onClick={() => setQuery(previous => ({ ...previous, attempt: previous.attempt + 1 }))}>Tentar novamente</button></p>}
    {data && (loading || error) && <p className="archive-previous">Exibindo a última lista carregada: {filterNames[data.filter]}.</p>}
    {openError && <p role="alert">{openError}</p>}
    {openingId && <p role="status">Abrindo partida…</p>}
    {data && data.games.length > 0 && <ul className="archive-list" aria-label="Partidas salvas">{data.games.map(game => {
      const agent = game.profile?.display_name ?? "Perfil não informado";
      const color = game.human_color === "white" ? "Brancas" : "Pretas";
      const date = dateLabel(game.updated_at);
      const outcome = result(game);
      const action = game.terminal ? "Rever partida" : "Continuar partida";
      return <li key={game.id} className="archive-card">
        <header><h3>{agent}</h3><span className="archive-state">{game.terminal ? "Finalizada" : "Em andamento"}</span></header>
        <p className="archive-color">Você: <strong>{color}</strong></p>
        {game.terminal && <p className="archive-result">{outcome ?? "Resultado não informado"}{reasons[game.status] && reasons[game.status] !== outcome && <span> · {reasons[game.status]}</span>}</p>}
        <p className="archive-meta">{Number.isInteger(game.move_count) && game.move_count >= 0 && <span>{game.move_count} {game.move_count === 1 ? "lance" : "lances"}</span>}{date ? <time dateTime={game.updated_at}>Atualizada em {date}</time> : <span>Data não disponível</span>}</p>
        <footer>
          <button type="button" className="archive-open" aria-label={`${action} contra ${agent}, você de ${color}${date ? `, atualizada em ${date}` : ""}`} disabled={loading || openingId !== null} onClick={() => void open(game, game.terminal)}>{action}</button>
          {!game.terminal && <button type="button" aria-label={`Rever partida contra ${agent}, você de ${color}${date ? `, atualizada em ${date}` : ""}`} disabled={loading || openingId !== null} onClick={() => void open(game, true)}>Rever partida</button>}
        </footer>
      </li>;
    })}</ul>}
    {!loading && !error && data?.games.length === 0 && <div className="archive-empty">
      {data.offset > 0 ? <h3>Nenhuma partida nesta página.</h3>
        : data.filter === "all" ? <><h3>Nenhuma partida ainda</h3><p>Jogue sua primeira partida contra um agente para começar seu histórico.</p><a className="botao-pixel" href="#/partida">Jogar agora</a></>
        : data.filter === "active" ? <><h3>Nenhuma partida em andamento.</h3><a href="#/partida">Nova partida</a></>
        : <h3>Nenhuma partida finalizada ainda.</h3>}
    </div>}
    {data && <nav className="archive-pagination" aria-label="Páginas do histórico">
      <button type="button" disabled={data.offset === 0 || loading || error || openingId !== null} onClick={() => setQuery(previous => ({ ...previous, offset: Math.max(0, data.offset - 20) }))}>Anterior</button>
      <span>Página {Math.floor(data.offset / 20) + 1}</span>
      <button type="button" disabled={data.next_offset === null || loading || error || openingId !== null} onClick={() => setQuery(previous => ({ ...previous, offset: data.next_offset! }))}>Próxima</button>
    </nav>}
  </div>;
}
