import { useEffect, useRef, useState } from "react";
import { api, ErroDePartida } from "../api";
import type { AgentProfile, Game, GameColor, GameSummary, HumanMoveRequest } from "../types";
import { GameHistory } from "./GameHistory";
import { Board } from "./Board";

export function AiGame({ onPosition }: { onPosition: (fen: string) => void }) {
  const [savedGames, setSavedGames] = useState<GameSummary[]>([]);
  const [listError, setListError] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listOffset, setListOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [listAttempt, setListAttempt] = useState(0);
  const [filter, setFilter] = useState<"all" | "active" | "finished">("all");
  useEffect(() => {
    let active = true;
    setListLoading(true); setListError(false);
    api.listGames(filter, listOffset).then(data => {
      if (!active) return;
      if (!data || !Array.isArray(data.games)) throw new Error("Lista inválida");
      setSavedGames(data.games); setNextOffset(data.next_offset);
    }).catch(() => { if (active) { setListError(true); setSavedGames([]); } })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [filter, listOffset, listAttempt]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [agent, setAgent] = useState("balanced");
  const [catalogError, setCatalogError] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoadingProfiles(true); setCatalogError(false);
    api.agents().then(data => {
      if (!active) return;
      const safe = Array.isArray(data) ? data.filter(p => p && typeof p.id === "string" && /^[a-z_]{1,64}$/.test(p.id)
        && typeof p.display_name === "string" && typeof p.description === "string"
        && ["beginner", "intermediate", "advanced"].includes(p.difficulty)
        && ["balanced", "aggressive", "positional", "tactical"].includes(p.style)) : [];
      setProfiles(safe); setCatalogError(safe.length === 0);
      setAgent(safe.find(p => p.id === "balanced")?.id ?? safe[0]?.id ?? "balanced");
    }).catch(() => { if (active) setCatalogError(true); })
      .finally(() => { if (active) setLoadingProfiles(false); });
    return () => { active = false; };
  }, [catalogAttempt]);
  const difficultyLabels = { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" };
  const styleLabels = { balanced: "equilibrado", aggressive: "agressivo", positional: "posicional", tactical: "tático" };
  const selectedProfile = profiles.find(p => p.id === agent);
  const [color, setColor] = useState<GameColor>("white");
  const [replayPosition, setReplayPosition] = useState<{ ply: number; fen: string } | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const currentProfile = game?.profile ?? ((game?.opponent.profile_version ?? 1) === 1 ? profiles.find(p => p.id === (game?.opponent.agent_id === "stockfish" ? "balanced" : game?.opponent.agent_id)) : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const pending = useRef<HumanMoveRequest | null>(null);
  const creation = useRef<{ color: GameColor; agent: string; key: string } | null>(null);
  function accept(next: Game) { setReplayPosition(null); setGame(next); onPosition(next.current_fen); setListAttempt(n => n + 1); }
  async function run(call: () => Promise<Game>, recoverCurrent = true) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      let next = await call();
      if (game && next.id === game.id && next.version < game.version) next = await api.getGame(game.id);
      accept(next); pending.current = null; creation.current = null;
      if (next.agent_status === "error") setError(next.human_move ? "Seu lance foi preservado. A IA não conseguiu jogar. Tente novamente o turno da IA." : "A partida foi preservada. A IA não conseguiu jogar. Tente novamente o turno da IA.");
    } catch (e) {
      if (e instanceof ErroDePartida && (e.status === 409 || e.status === 422)) creation.current = null;
      setError(e instanceof Error ? e.message : "Não foi possível carregar a partida.");
      // Uma falha de transporte pode ocorrer depois do commit. Recarregue antes de jogar.
      if (recoverCurrent && game && e instanceof ErroDePartida && e.status !== 401) {
        try { accept(await api.getGame(game.id)); if (e.status === 409 || e.status === 422) pending.current = null; } catch { /* intenção permanece para retry seguro */ }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  function start() {
    if (lock.current) return;
    pending.current = null;
    const request = creation.current ?? { color, agent, key: crypto.randomUUID() };
    creation.current = request;
    void run(() => api.createGame(request.color, request.agent, request.key), false);
  }
  function resume(id: string) {
    if (lock.current || creation.current) return;
    pending.current = null;
    void run(() => api.getGame(id), false);
  }
  function move(uci: string) {
    if (!game || busy || lock.current || game.terminal || game.awaiting_agent || pending.current || creation.current || replayPosition) return;
    const intent = { move: uci, version: game.version, client_move_id: crypto.randomUUID() };
    pending.current = intent;
    void run(() => api.submitHumanMove(game.id, intent));
  }
  const draws: Partial<Record<Game["status"], string>> = {
    stalemate: "Empate por afogamento.", insufficient_material: "Empate por material insuficiente.",
    repetition: "Empate por repetição tripla.", fifty_move: "Empate pela regra dos cinquenta lances.", draw: "Empate.",
  };
  const status = !game ? "Escolha seu lado e inicie a partida." : game.status === "checkmate"
    ? `Xeque-mate. ${game.winner === "white" ? "Brancas" : "Pretas"} venceram.`
    : game.terminal ? draws[game.status] ?? "Partida encerrada." : game.status === "check" ? "Xeque!" : game.awaiting_agent ? "É o turno da IA. Use Tentar novamente o turno da IA." : `Turno das ${game.side_to_move === "white" ? "brancas" : "pretas"}.`;
  return <section aria-label="Partida contra IA" className="board-workspace max-w-[680px] mx-auto p-4">
    <h2>Partida contra IA</h2>
    <label>Adversário <select aria-label="Adversário" value={agent} disabled={busy || loadingProfiles || Boolean(creation.current)} onChange={e => setAgent(e.target.value)}>
      {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
    </select></label>
    <p>{selectedProfile && `${difficultyLabels[selectedProfile.difficulty]} · estilo ${styleLabels[selectedProfile.style]}. ${selectedProfile.description}`} Estilos são heurísticos, sem imitação de jogadores reais.</p>
    {catalogError && <p role="alert">Não foi possível carregar os adversários. <button onClick={() => setCatalogAttempt(n => n + 1)}>Recarregar adversários</button></p>}
    {game && <p>Partida atual: {game.id} · Perfil v{game.opponent.profile_version ?? 1}. Adversário da partida: {currentProfile?.display_name ?? game.opponent.agent_id}{currentProfile && ` · ${difficultyLabels[currentProfile.difficulty]} / ${styleLabels[currentProfile.style]}`}</p>}
    <label>Seu lado <select aria-label="Seu lado" value={color} disabled={busy || Boolean(creation.current)} onChange={e => setColor(e.target.value as GameColor)}>
      <option value="white">Brancas</option><option value="black">Pretas</option>
    </select></label>
    <button type="button" disabled={busy || loadingProfiles || catalogError || !profiles.some(p => p.id === agent)} onClick={start}>{creation.current && !busy ? "Confirmar criação da partida" : game ? "Nova partida contra IA" : "Iniciar partida contra IA"}</button>
    <p aria-live="polite">{busy ? "Aguardando o servidor e a resposta da IA…" : status}</p>
    {error && <p role="alert">{error}</p>}
    {creation.current && !busy && <p>Criação ainda não confirmada. Confirme usando a mesma solicitação para evitar duplicação.</p>}
    <section aria-label="Suas partidas">
      <h3>Suas partidas</h3>
      <label>Mostrar <select aria-label="Filtrar partidas" value={filter} disabled={busy} onChange={e => { setFilter(e.target.value as typeof filter); setListOffset(0); }}>
        <option value="all">Todas</option><option value="active">Em andamento</option><option value="finished">Encerradas</option>
      </select></label>
      <button disabled={busy || listLoading} onClick={() => setListAttempt(n => n + 1)}>Atualizar partidas</button>
      {listLoading ? <p role="status">Carregando partidas…</p> : listError ? <p role="alert">Não foi possível listar as partidas. Use Atualizar partidas para tentar novamente.</p>
        : savedGames.length === 0 ? <p>Nenhuma partida encontrada.</p> : <ul>{savedGames.map((saved, index) => <li key={saved.id}>
          <p>{saved.profile?.display_name ?? saved.opponent.agent_id} · {saved.profile ? `${difficultyLabels[saved.profile.difficulty]} / ${styleLabels[saved.profile.style]}` : `perfil v${saved.opponent.profile_version ?? 1}`} · Você: {saved.human_color === "white" ? "brancas" : "pretas"} · {saved.terminal ? "Encerrada" : "Em andamento"}
          {index === 0 && listOffset === 0 ? " · Mais recente" : ""} · {saved.move_count} lances · Turno: {saved.side_to_move === "white" ? "brancas" : "pretas"} · {saved.status} · Atualizada: {new Date(saved.updated_at).toLocaleString("pt-BR")}</p>
          <button disabled={busy || Boolean(creation.current)} onClick={() => resume(saved.id)}>{saved.terminal ? "Revisar partida" : "Continuar partida"} {saved.id.slice(0, 8)}</button>
        </li>)}</ul>}
      {listOffset > 0 && <button disabled={busy || listLoading} onClick={() => setListOffset(n => Math.max(0, n - 20))}>Partidas anteriores</button>}
      {nextOffset !== null && !listError && <button disabled={busy || listLoading} onClick={() => setListOffset(nextOffset)}>Mais partidas</button>}
    </section>
    {game && !replayPosition && !game.terminal && game.awaiting_agent && <button disabled={busy} onClick={() => { pending.current = null; void run(() => api.resumeAgent(game.id, game.version)); }}>Tentar novamente o turno da IA</button>}
    {game && !replayPosition && pending.current && !game.awaiting_agent && <button disabled={busy} onClick={() => void run(() => api.submitHumanMove(game.id, pending.current!))}>Confirmar estado do lance</button>}
    {game && <Board fen={replayPosition?.fen ?? game.current_fen} orientation={game.human_color} estadoTexto={replayPosition ? `Replay somente leitura · lance ${replayPosition.ply}` : status} terminado={game.terminal}
      ocupado={busy || game.awaiting_agent || Boolean(pending.current) || Boolean(creation.current) || Boolean(replayPosition)} hideControls podeDesfazer={false}
      onMoveIntent={move} onLance={() => {}} onDesfazer={() => {}} onReiniciar={start} onAnalisar={() => {}} />}
    {game && <GameHistory key={game.id} game={game} disabled={busy || Boolean(pending.current) || Boolean(creation.current)} selected={replayPosition?.ply ?? null}
      onSelect={(ply, fen) => setReplayPosition(ply === null ? null : { ply, fen: fen! })} />}
  </section>;
}
