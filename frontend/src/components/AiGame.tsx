import { useEffect, useRef, useState } from "react";
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

export function AiGame({ onPosition, onTutor, onGameActive }: { onPosition: (fen: string) => void; onTutor?: (opener: HTMLElement) => void; onGameActive?: (active: boolean) => void }) {
  const [savedGames, setSavedGames] = useState<GameSummary[]>([]);
  const [listError, setListError] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listOffset, setListOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [listAttempt, setListAttempt] = useState(0);
  const [filter, setFilter] = useState<"all" | "active" | "finished">("all");

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(false);
    api.listGames(filter, listOffset)
      .then((data) => {
        if (!active) return;
        if (!data || !Array.isArray(data.games)) throw new Error("Lista inválida");
        setSavedGames(data.games);
        setNextOffset(data.next_offset);
      })
      .catch(() => {
        if (active) {
          setListError(true);
          setSavedGames([]);
        }
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, listOffset, listAttempt]);

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
    if (lock.current) return;
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

  function resume(id: string) {
    if (lock.current || creation.current) return;
    pending.current = null;
    void run(() => api.getGame(id), false);
  }

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
        <section aria-label="Suas partidas" className="saved-games">
          <header className="saved-games-heading"><div><h3>Suas partidas</h3><p>Retome uma partida ou reveja seus lances.</p></div></header>
          <div className="saved-games-toolbar">
          <label>
            Mostrar
            <select
              aria-label="Filtrar partidas"
              value={filter}
              disabled={busy}
              onChange={(e) => {
                setFilter(e.target.value as typeof filter);
                setListOffset(0);
              }}
            >
              <option value="all">Todas</option>
              <option value="active">Em andamento</option>
              <option value="finished">Encerradas</option>
            </select>
          </label>
          <button disabled={busy || listLoading} onClick={() => setListAttempt((n) => n + 1)}>
            Atualizar partidas
          </button>
          </div>
          {listLoading ? (
            <p role="status">Carregando partidas…</p>
          ) : listError ? (
            <p role="alert">Não foi possível listar as partidas. Use Atualizar partidas para tentar novamente.</p>
          ) : savedGames.length === 0 ? (
            <p>Nenhuma partida encontrada.</p>
          ) : (
            <ul>
              {savedGames.map((saved, index) => (
                <li key={saved.id} className="saved-game-card">
                  <header><h4>{saved.profile?.display_name ?? saved.opponent.agent_id}</h4><span className="saved-game-state">{saved.terminal ? "Encerrada" : "Em andamento"}</span></header>
                  <p className="saved-game-meta">Você: {saved.human_color === "white" ? "brancas" : "pretas"} · {saved.move_count} {saved.move_count === 1 ? "lance" : "lances"} · {saved.terminal ? "Resultado final" : saved.awaiting_agent || saved.side_to_move !== saved.human_color ? "Vez da IA" : "Sua vez"}</p>
                  <footer><time dateTime={saved.updated_at} title={new Date(saved.updated_at).toLocaleString("pt-BR")}>Atualizada {new Date(saved.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{index === 0 && listOffset === 0 && <span> · Mais recente</span>}</time>
                    <button title={saved.id} aria-label={`${saved.terminal ? "Revisar partida" : "Continuar partida"} ${saved.id.slice(0, 8)} · ${saved.profile?.display_name ?? saved.opponent.agent_id}`} disabled={busy || Boolean(creation.current)} onClick={() => resume(saved.id)}>{saved.terminal ? "Revisar partida" : "Continuar partida"}</button>
                  </footer>
                  <details className="saved-game-details"><summary>Informações</summary><p>{saved.profile ? `${difficultyLabels[saved.profile.difficulty]} / ${styleLabels[saved.profile.style]}` : `Perfil v${saved.opponent.profile_version ?? 1}`} · {({ playing: "Em jogo", check: "Xeque", checkmate: "Xeque-mate", stalemate: "Afogamento", insufficient_material: "Material insuficiente", repetition: "Repetição tripla", fifty_move: "Cinquenta lances", draw: "Empate" })[saved.status]} · Turno: {saved.side_to_move === "white" ? "brancas" : "pretas"} · {new Date(saved.updated_at).toLocaleString("pt-BR")} · ID: {saved.id}</p></details>
                </li>
              ))}
            </ul>
          )}
          {listOffset > 0 && (
            <button disabled={busy || listLoading} onClick={() => setListOffset((n) => Math.max(0, n - 20))}>
              Partidas anteriores
            </button>
          )}
          {nextOffset !== null && !listError && (
            <button disabled={busy || listLoading} onClick={() => setListOffset(nextOffset)}>
              Mais partidas
            </button>
          )}
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
