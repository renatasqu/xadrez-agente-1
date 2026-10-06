import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { api, ErroDePartida } from "../api";
import type { AgentProfile, Game, GameColor, GameSummary, HumanMoveRequest } from "../types";
import { GameHistory } from "./GameHistory";
import { AgentComment } from "./AgentComment";
import { Board } from "./Board";
import { Sprite } from "../pixel/Sprite";
import { AVATARES } from "../pixel/sprites";

function MatchAvatar({ human = false }: { human?: boolean }) {
  const sprite = AVATARES[human ? "gelo" : "fogo"];
  return <span className="official-avatar"><Sprite grade={sprite.grade} paleta={sprite.paleta} rotulo={human ? "Seu avatar" : "Avatar do agente"} /></span>;
}

export interface AiGameHandle { loadSavedGame: (id: string, review?: boolean) => Promise<boolean> }

export function AiGame({ ref, visible = true, onPosition, onTutor, onGameActive }: { ref?: Ref<AiGameHandle>; visible?: boolean; onPosition: (fen: string) => void; onTutor?: (opener: HTMLElement) => void; onGameActive?: (active: boolean) => void }) {
  const [savedGames, setSavedGames] = useState<GameSummary[]>([]);
  const [listError, setListError] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listAttempt, setListAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(false);
    api.listGames("active", 0)
      .then((data) => {
        if (!active) return;
        if (!data || !Array.isArray(data.games)) throw new Error("Lista inválida");
        setSavedGames(data.games.filter(saved => !saved.terminal).slice(0, 1));
      })
      .catch(() => {
        if (active) {
          setListError(true);
        }
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listAttempt]);

  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [agent, setAgent] = useState("balanced");
  const [catalogError, setCatalogError] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [catalogAttempt, setCatalogAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadingProfiles(true);
    setCatalogError(false);
    api.agents()
      .then((data) => {
        if (!active) return;
        const safe = Array.isArray(data)
          ? data.filter(
              (p) =>
                p &&
                typeof p.id === "string" &&
                /^[a-z_]{1,64}$/.test(p.id) &&
                typeof p.display_name === "string" &&
                typeof p.description === "string" &&
                ["beginner", "intermediate", "advanced"].includes(p.difficulty) &&
                ["balanced", "aggressive", "positional", "tactical"].includes(p.style),
            )
          : [];
        setProfiles(safe);
        setCatalogError(safe.length === 0);
        setAgent(safe.find((p) => p.id === "balanced")?.id ?? safe[0]?.id ?? "balanced");
      })
      .catch(() => {
        if (active) setCatalogError(true);
      })
      .finally(() => {
        if (active) setLoadingProfiles(false);
      });
    return () => {
      active = false;
    };
  }, [catalogAttempt]);

  const difficultyLabels = { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" };
  const styleLabels = { balanced: "equilibrado", aggressive: "agressivo", positional: "posicional", tactical: "tático" };
  const selectedProfile = profiles.find((p) => p.id === agent);
  const [color, setColor] = useState<GameColor>("white");
  const [replayPosition, setReplayPosition] = useState<{ ply: number; fen: string } | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const gameActive = game !== null;
  useEffect(() => { onGameActive?.(gameActive); }, [gameActive, onGameActive]);
  const currentProfile =
    game?.profile ??
    ((game?.opponent.profile_version ?? 1) === 1
      ? profiles.find((p) => p.id === (game?.opponent.agent_id === "stockfish" ? "balanced" : game?.opponent.agent_id))
      : undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const pending = useRef<HumanMoveRequest | null>(null);
  const creation = useRef<{ color: GameColor; agent: string; key: string } | null>(null);

  function accept(next: Game) {
    if (next.terminal) window.dispatchEvent(new Event("xadrez:rating-updated"));
    setReplayPosition(null);
    setGame(next);
    onPosition(next.current_fen);
    setListAttempt((n) => n + 1);
  }

  async function run(call: () => Promise<Game>, recoverCurrent = true) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      let next = await call();
      if (game && next.id === game.id && next.version < game.version) next = await api.getGame(game.id);
      accept(next);
      pending.current = null;
      creation.current = null;
      if (next.agent_status === "error") {
        setError(
          next.human_move
            ? "Seu lance foi preservado. A IA não conseguiu jogar. Tente novamente o turno da IA."
            : "A partida foi preservada. A IA não conseguiu jogar. Tente novamente o turno da IA.",
        );
      }
      return next;
    } catch (e) {
      if (e instanceof ErroDePartida && (e.status === 409 || e.status === 422)) creation.current = null;
      setError(e instanceof Error ? e.message : "Não foi possível carregar a partida.");
      if (recoverCurrent && game && e instanceof ErroDePartida && e.status !== 401) {
        try {
          accept(await api.getGame(game.id));
          if (e.status === 409 || e.status === 422) pending.current = null;
        } catch {
          // intenção permanece para retry seguro
        }
      }
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function start() {
    if (lock.current) return;
    pending.current = null;
    const request = creation.current ?? { color, agent, key: crypto.randomUUID() };
    creation.current = request;
    void run(() => api.createGame(request.color, request.agent, request.key), false);
  }

  async function resume(id: string, review = false): Promise<boolean> {
    if (lock.current || creation.current || pending.current) return false;
    const next = await run(() => api.getGame(id), false);
    if (next && review) setReplayPosition({ ply: next.moves.length, fen: next.current_fen });
    return next !== null;
  }
  useImperativeHandle(ref, () => ({ loadSavedGame: resume }));

  function move(uci: string) {
    if (!game || busy || lock.current || game.terminal || game.awaiting_agent || game.side_to_move !== game.human_color || pending.current || creation.current || replayPosition) return;
    const intent = { move: uci, version: game.version, client_move_id: crypto.randomUUID() };
    pending.current = intent;
    void run(() => api.submitHumanMove(game.id, intent));
  }

  const draws: Partial<Record<Game["status"], string>> = {
    stalemate: "Empate por afogamento.",
    insufficient_material: "Empate por material insuficiente.",
    repetition: "Empate por repetição tripla.",
    fifty_move: "Empate pela regra dos cinquenta lances.",
    draw: "Empate.",
  };

  const status = !game
    ? "Escolha seu lado e inicie a partida."
    : game.status === "checkmate"
      ? `Xeque-mate. ${game.winner === "white" ? "Brancas" : "Pretas"} venceram.`
      : game.terminal
        ? draws[game.status] ?? "Partida encerrada."
        : game.awaiting_agent || game.side_to_move !== game.human_color
            ? game.awaiting_agent ? "É o turno da IA. Use Tentar novamente o turno da IA." : "É o turno da IA."
            : game.status === "check" ? "Xeque!" : `Turno das ${game.side_to_move === "white" ? "brancas" : "pretas"}.`;

  if (!game) {
    return (
      <section aria-label="Partida contra IA" className="official-setup">
        <header className="setup-heading"><span className="eyebrow">SUA PRÓXIMA PARTIDA</span><h2>JOGAR CONTRA IA</h2><p>Escolha seu adversário e seu lado.</p></header>
        <div className="setup-options">
        <div className="setup-opponent">
        <label>
          Adversário
          <select
            aria-label="Adversário"
            value={agent}
            disabled={busy || loadingProfiles || Boolean(creation.current)}
            onChange={(e) => setAgent(e.target.value)}
          >
            {[false, true].map((inspired) => (
              <optgroup key={String(inspired)} label={inspired ? "Perfis inspirados" : "Perfis de treino"}>
                {profiles.filter((p) => Boolean(p.inspiration) === inspired).map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="selected-opponent"><MatchAvatar /><div><h3>{selectedProfile?.display_name ?? "Carregando adversários…"}</h3><p>
          {selectedProfile && `${difficultyLabels[selectedProfile.difficulty]} · estilo ${styleLabels[selectedProfile.style]}. ${selectedProfile.description}`}
          {selectedProfile && !selectedProfile.inspiration && " Estilos são heurísticos, sem imitação de jogadores reais."}
        </p></div></div>
        {catalogError && (
          <p role="alert">
            Não foi possível carregar os adversários. <button onClick={() => setCatalogAttempt((n) => n + 1)}>Recarregar adversários</button>
          </p>
        )}
        </div>
        <div className="setup-color"><h3>JOGAR COMO</h3>
        <label className="sr-only">
          Seu lado
          <select aria-label="Seu lado" value={color} disabled={busy || Boolean(creation.current)} onChange={(e) => setColor(e.target.value as GameColor)}>
            <option value="white">Brancas</option>
            <option value="black">Pretas</option>
          </select>
        </label>
        <div className="color-options">{(["white", "black"] as const).map(side => <button key={side} type="button" aria-pressed={color === side} disabled={busy || Boolean(creation.current)} onClick={() => setColor(side)}><span aria-hidden="true">{side === "white" ? "♔" : "♚"}</span>{side === "white" ? "BRANCAS" : "PRETAS"}<small>{side === "white" ? "Você faz a abertura" : "A IA faz a abertura"}</small></button>)}</div>
        <button
          className="setup-start botao-pixel"
          type="button"
          disabled={busy || loadingProfiles || catalogError || !profiles.some((p) => p.id === agent)}
          onClick={start}
        >
          {creation.current && !busy ? "Confirmar criação da partida" : "Iniciar partida contra IA"}
        </button>
        <p aria-live="polite">{busy ? "Aguardando o servidor e a resposta da IA…" : status}</p>
        {error && <p role="alert">{error}</p>}
        {creation.current && !busy && <p>Criação ainda não confirmada. Confirme usando a mesma solicitação para evitar duplicação.</p>}

        </div></div>
        <section aria-label="Continuar sua partida" className="saved-games">
          <header className="saved-games-heading"><div><h3>Continuar sua partida</h3><p>Retome sua partida em andamento mais recente.</p></div></header>
          {listLoading ? <p role="status">Carregando partidas…</p> : listError ? <p role="alert">Não foi possível consultar a partida mais recente. <button disabled={busy} onClick={() => setListAttempt(n => n + 1)}>Tentar novamente</button></p>
            : savedGames.length === 0 ? <p>Nenhuma partida em andamento.</p> : savedGames.map(saved => <div key={saved.id} className="saved-game-card">
              <h4>{saved.profile?.display_name ?? profiles.find(profile => profile.id === saved.opponent.agent_id)?.display_name ?? "Agente da partida"}</h4>
              <p>Você: {saved.human_color === "white" ? "brancas" : "pretas"} · {saved.move_count} lances{saved.status === "check" && " · Xeque"}</p>
              <button disabled={busy || Boolean(creation.current)} onClick={() => void resume(saved.id)}>Continuar partida</button>
            </div>)}
          <a href="#/historico">Ver todas as partidas no Histórico</a>
        </section>
      </section>
    );
  }

  const opponentName = currentProfile?.display_name ?? game.opponent.agent_id;
  const humanSide = game.human_color === "white" ? "brancas" : "pretas";
  const agentTurn = game.awaiting_agent || game.side_to_move !== game.human_color;
  return (
    <section aria-label="Partida contra IA" className="official-match">
      <header className="official-match-context">
        <span className="eyebrow">{replayPosition ? "REPLAY · SOMENTE LEITURA" : game.terminal ? "PARTIDA ENCERRADA" : "PARTIDA CONTRA IA"}</span>
        <div className="match-identities">
          <div className="match-identity human-identity"><MatchAvatar human /><div><h2>VOCÊ</h2><p>Você: {humanSide}</p></div></div>
          <span className="match-versus">vs.</span>
          <div className="match-identity agent-identity"><MatchAvatar /><div><h2>{opponentName}</h2><p>Agente · {game.human_color === "white" ? "pretas" : "brancas"}</p></div></div>
        </div>
        <span className="match-state" role="status">{replayPosition ? `REPLAY · Lance ${replayPosition.ply}` : game.terminal ? "Resultado final" : busy || agentTurn ? "VEZ DA IA" : "SUA VEZ"}</span>
      </header>
      <div className="official-match-grid">
        <div className="official-board-column">
      <Board
        key={game.id}
        visible={visible}
        fen={replayPosition?.fen ?? game.current_fen}
        orientation={game.human_color}
        humanColor={game.human_color}
        estadoTexto={replayPosition ? `Replay somente leitura · lance ${replayPosition.ply}` : status}
        terminado={game.terminal}
        ocupado={busy || game.awaiting_agent || game.side_to_move !== game.human_color || Boolean(pending.current) || Boolean(creation.current) || Boolean(replayPosition)}
        hideControls
        podeDesfazer={false}
        onMoveIntent={move}
        onLance={() => {}}
        onDesfazer={() => {}}
        onReiniciar={start}
        onAnalisar={() => {}}
      />
        </div>
        <aside className="official-match-sidebar" aria-label="Painel da partida">
          <section className={`match-panel turn-panel${!game.terminal && !game.awaiting_agent && !pending.current && !error && game.status !== "check" ? " turn-panel--quiet" : ""}`} aria-label="Estado da partida"><span className="eyebrow">{game.terminal ? "RESULTADO" : replayPosition ? "REPLAY" : "TURNO"}</span>
            <p aria-live="polite">{replayPosition ? `Replay somente leitura · lance ${replayPosition.ply}` : busy ? "Aguardando o servidor e a resposta da IA…" : status}</p>
            {game.terminal && replayPosition && <p>{status}</p>}
            {error && <p role="alert">{error}</p>}
            {!replayPosition && !game.terminal && game.awaiting_agent && <button disabled={busy} onClick={() => { pending.current = null; void run(() => api.resumeAgent(game.id, game.version)); }}>Tentar novamente o turno da IA</button>}
            {!replayPosition && pending.current && !game.awaiting_agent && <button disabled={busy} onClick={() => void run(() => api.submitHumanMove(game.id, pending.current!))}>Confirmar estado do lance</button>}
            {game.terminal && game.rating_change && <p aria-label="Variação de rating">{({ win: "Vitória", draw: "Empate", loss: "Derrota" })[game.rating_change.result]} · Rating nesta partida: {game.rating_change.after} · {game.rating_change.delta > 0 ? "+" : ""}{game.rating_change.delta}</p>}
            {game.terminal && <button type="button" disabled={busy || Boolean(creation.current)} onClick={start}>Nova partida</button>}
            {game.terminal && !game.rating_change && <button disabled={busy} onClick={() => void run(() => api.reconcileRating(game.id, game.version))}>Atualizar pontuação desta partida</button>}
          </section>
          <div className="match-panel official-history">
      <GameHistory
        key={game.id}
        game={game}
        disabled={busy || Boolean(pending.current) || Boolean(creation.current)}
        selected={replayPosition?.ply ?? null}
        onSelect={(ply, fen) => setReplayPosition(ply === null ? null : { ply, fen: fen! })}
      />
          </div>
          <section className="match-panel contextual-tutor"><span className="eyebrow">COMENTÁRIO / TUTOR</span><AgentComment game={game} />
            {onTutor && <button type="button" onClick={event => onTutor(event.currentTarget)}>Conversar sobre esta posição</button>}
          </section>
          <details className="match-details match-profile-details"><summary>Detalhes da partida</summary><p>{currentProfile && `${difficultyLabels[currentProfile.difficulty]} · ${styleLabels[currentProfile.style]}`}</p><p>{currentProfile?.description}</p><p>Partida atual: {game.id} · Perfil v{game.opponent.profile_version ?? 1}. Adversário da partida: {opponentName}{currentProfile && ` · ${difficultyLabels[currentProfile.difficulty]} / ${styleLabels[currentProfile.style]}`}{currentProfile?.persona && ` · Persona v${currentProfile.persona.version} (${currentProfile.persona.tone})`}</p></details>
        </aside>
      </div>
    </section>
  );
}
