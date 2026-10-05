import { useEffect, useRef, useState } from "react";
import { api, ErroDePartida } from "../api";
import type { AgentProfile, Game, GameColor, HumanMoveRequest } from "../types";
import { Board } from "./Board";

export function AiGame({ onPosition }: { onPosition: (fen: string) => void }) {
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
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const pending = useRef<HumanMoveRequest | null>(null);
  function accept(next: Game) { setGame(next); onPosition(next.current_fen); }
  async function run(call: () => Promise<Game>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      let next = await call();
      if (game && next.id === game.id && next.version < game.version) next = await api.getGame(game.id);
      accept(next); pending.current = null;
      if (next.agent_status === "error") setError(next.human_move ? "Seu lance foi preservado. A IA não conseguiu jogar. Tente novamente o turno da IA." : "A partida foi preservada. A IA não conseguiu jogar. Tente novamente o turno da IA.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a partida.");
      // Uma falha de transporte pode ocorrer depois do commit. Recarregue antes de jogar.
      if (game && e instanceof ErroDePartida && e.status !== 401) {
        try { accept(await api.getGame(game.id)); if (e.status === 409 || e.status === 422) pending.current = null; } catch { /* intenção permanece para retry seguro */ }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  function start() { pending.current = null; void run(() => api.createGame(color, agent)); }
  function move(uci: string) {
    if (!game || busy || lock.current || game.terminal || game.awaiting_agent || pending.current) return;
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
    : game.terminal ? draws[game.status] ?? "Partida encerrada." : game.status === "check" ? "Xeque!" : `Turno das ${game.side_to_move === "white" ? "brancas" : "pretas"}.`;
  return <section aria-label="Partida contra IA" className="board-workspace max-w-[680px] mx-auto p-4">
    <h2>Partida contra IA</h2>
    <label>Adversário <select aria-label="Adversário" value={agent} disabled={busy || loadingProfiles} onChange={e => setAgent(e.target.value)}>
      {profiles.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
    </select></label>
    <p>{selectedProfile && `${difficultyLabels[selectedProfile.difficulty]} · estilo ${styleLabels[selectedProfile.style]}. ${selectedProfile.description}`} Estilos são heurísticos, sem imitação de jogadores reais.</p>
    {catalogError && <p role="alert">Não foi possível carregar os adversários. <button onClick={() => setCatalogAttempt(n => n + 1)}>Recarregar adversários</button></p>}
    {game && <p>Adversário da partida: {profiles.find(p => p.id === (game.opponent.agent_id === "stockfish" ? "balanced" : game.opponent.agent_id))?.display_name ?? game.opponent.agent_id}</p>}
    <label>Seu lado <select aria-label="Seu lado" value={color} disabled={busy} onChange={e => setColor(e.target.value as GameColor)}>
      <option value="white">Brancas</option><option value="black">Pretas</option>
    </select></label>
    <button type="button" disabled={busy || loadingProfiles || catalogError || !profiles.some(p => p.id === agent)} onClick={start}>{game ? "Nova partida contra IA" : "Iniciar partida contra IA"}</button>
    <p aria-live="polite">{busy ? "Aguardando o servidor e a resposta da IA…" : status}</p>
    {error && <p role="alert">{error}</p>}
    {game && !game.terminal && game.awaiting_agent && <button disabled={busy} onClick={() => { pending.current = null; void run(() => api.resumeAgent(game.id, game.version)); }}>Tentar novamente o turno da IA</button>}
    {game && pending.current && !game.awaiting_agent && <button disabled={busy} onClick={() => void run(() => api.submitHumanMove(game.id, pending.current!))}>Confirmar estado do lance</button>}
    {game && <Board fen={game.current_fen} orientation={game.human_color} estadoTexto={status} terminado={game.terminal}
      ocupado={busy || game.awaiting_agent || Boolean(pending.current)} hideControls podeDesfazer={false}
      onMoveIntent={move} onLance={() => {}} onDesfazer={() => {}} onReiniciar={start} onAnalisar={() => {}} />}
    {game && <ol aria-label="Histórico oficial">{game.moves.map((m, i) => <li key={i}>{m}</li>)}</ol>}
  </section>;
}
