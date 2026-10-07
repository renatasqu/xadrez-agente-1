import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Game, GameEvaluation, GameReplay, GameReviewResult } from "../types";

const buttonStyle = "rounded border px-3 py-1 disabled:opacity-50";

function score(value: GameEvaluation) {
  if (value.mate === 0 && value.status === "checkmate") return `Xeque-mate. Vencedor: ${value.vencedor === "white" ? "brancas" : "pretas"}.`;
  if (value.mate !== null) return `Mate em ${Math.abs(value.mate)} a favor das ${value.mate > 0 ? "brancas" : "pretas"}.`;
  return value.pontos !== null ? `${value.pontos} CP` : `Sem score numérico (${value.status}).`;
}

export function GameHistory({ game, disabled, selected, onSelect }: {
  game: Game; disabled: boolean; selected: number | null; onSelect: (ply: number | null, fen?: string) => void;
}) {
  const [history, setHistory] = useState<GameReplay | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [review, setReview] = useState<GameReviewResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pgn, setPgn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const analysisLock = useRef(false);
  const exportLock = useRef(false);
  useEffect(() => {
    let active = true;
    setHistory(null); setLoadError(false);
    api.gameReplay(game.id).then(data => {
      if (active) {
        if (!data || data.game_id !== game.id || data.version !== game.version) throw new Error("Snapshot desatualizado");
        setHistory(data);
      }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [game.id, game.version, attempt]);
  useEffect(() => {
    generation.current++; setReview(null); setAnalyzing(false); analysisLock.current = false; setError(null);
    return () => { generation.current++; };
  }, [game.id, game.version, selected]);
  useEffect(() => { setPgn(null); }, [game.id, game.version]);
  const ply = selected ?? game.moves.length;
  function navigate(next: number) {
    if (!history) return;
    onSelect(next, next === 0 ? history.initial_fen : history.steps[next-1].fen);
  }
  async function analyze() {
    if (analysisLock.current || !history) return;
    const token = generation.current;
    analysisLock.current = true; setAnalyzing(true); setError(null);
    try {
      const data = await api.reviewGame(game.id, ply, game.version);
      if (token === generation.current) {
        if (data.game_id !== game.id || data.version !== game.version || data.ply !== ply) throw new Error("Análise de outra posição descartada.");
        setReview(data);
      }
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : "Análise indisponível."); }
    finally { if (token === generation.current) { setAnalyzing(false); analysisLock.current = false; } }
  }
  async function exportPgn() {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(true); setError(null);
    const token = generation.current;
    try {
      const text = await api.gamePgn(game.id);
      if (token !== generation.current) return;
      setPgn(text);
      const url = URL.createObjectURL(new Blob([text], { type: "application/x-chess-pgn" }));
      const link = document.createElement("a"); link.href = url; link.download = "partida.pgn"; link.click();
      // Defer cleanup until the browser has consumed the download URL.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : "Exportação indisponível."); }
    finally { exportLock.current = false; setExporting(false); }
  }
  return <section aria-label="Histórico oficial" className="official-history-content mt-4 space-y-3">
    <h3 className="history-heading">{selected !== null ? "Revisão" : "Partida"}</h3>
    {loadError ? <p role="alert">Histórico indisponível ou partida mudou. <button className={buttonStyle} onClick={() => setAttempt(n => n + 1)}>Recarregar histórico</button></p> : !history ? <p role="status">Carregando histórico…</p> : <>
      <p aria-live="polite">{selected !== null ? `Replay somente leitura · lance ${ply}/${history.steps.length}` : "Posição atual"} · {history.result === "*" ? "Partida em andamento" : `Resultado: ${history.result}`}</p>
      {game.terminal && selected === null && <button className={buttonStyle} disabled={disabled} onClick={() => navigate(0)}>Rever partida</button>}
      <div className="history-navigation flex flex-wrap gap-2" role="group" aria-label="Navegar pelo histórico">
        <button className={buttonStyle} disabled={disabled || ply === 0} onClick={() => navigate(0)} title="Início do histórico"><span aria-hidden="true">⏮</span><span className="sr-only">Início do histórico</span></button>
        <button className={buttonStyle} disabled={disabled || ply === 0} onClick={() => navigate(ply-1)} title="Lance anterior"><span aria-hidden="true">←</span><span className="sr-only">Lance anterior</span></button>
        <button className={buttonStyle} disabled={disabled || ply === history.steps.length} onClick={() => navigate(ply+1)} title="Próximo lance"><span aria-hidden="true">→</span><span className="sr-only">Próximo lance</span></button>
        <button className={buttonStyle} disabled={disabled} onClick={() => navigate(history.steps.length)} title="Fim do histórico"><span aria-hidden="true">⏭</span><span className="sr-only">Fim do histórico</span></button>
        {selected !== null && <button className={buttonStyle} disabled={disabled} onClick={() => onSelect(null)}><span>Voltar à posição atual</span></button>}
      </div>
      <ol aria-label="Lances SAN" className="history-pairs">{Array.from(new Set(history.steps.map(move => move.move_number))).map(number => <li key={number} className="history-pair">
        <span className="history-move-number" aria-hidden="true">{number}.</span>
        {(["white", "black"] as const).map(color => {
          const move = history.steps.find(step => step.move_number === number && step.color === color);
          return move ? <button key={move.ply} className={buttonStyle} disabled={disabled} aria-label={`${move.move_number}${move.color === "white" ? "." : "…"} ${move.san}`} aria-current={ply === move.ply ? "step" : undefined} onClick={() => navigate(move.ply)}>{move.san}</button> : <span key={color} className="history-missing" aria-label={color === "white" ? "Nenhum lance branco nesta jogada" : "Nenhum lance preto nesta jogada"}>—</span>;
        })}
      </li>)}</ol>
      <button className={`${buttonStyle} history-analyze`} disabled={disabled || analyzing} onClick={() => void analyze()}>{analyzing ? "Stockfish analisando…" : "Analisar lance selecionado"}</button>
    </>}
    <button className={`${buttonStyle} history-export`} disabled={disabled || exporting} onClick={() => void exportPgn()}>{exporting ? "Exportando…" : "Exportar PGN"}</button>
    {pgn && <textarea aria-label="PGN exportado" readOnly value={pgn} rows={8} className="w-full" />}
    {error && <p role="alert">{error}</p>}
    {review && <section aria-label="Revisão Stockfish" className="rounded border p-3 space-y-1">
      <p>Perspectiva: brancas. Positivo favorece brancas; negativo favorece pretas.</p>
      <p>Lance: {review.played?.san ?? "Posição inicial"}</p>
      <p>Antes: {score(review.before)}</p><p>Melhor lance antes: {review.before.melhor_lance ?? "Nenhum (posição terminal)"}</p>
      <p>PV antes: {review.before.linha.join(" ") || "—"}</p>
      <p>Depois: {score(review.after)}</p>
      {review.cp_delta_white !== null && <p>Variação para brancas: {review.cp_delta_white} CP</p>}
      <p>Duas buscas limitadas; sem classificação automática do lance.</p>
    </section>}
  </section>;
}
