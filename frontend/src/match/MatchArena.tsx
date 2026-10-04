import { memo, useEffect, useState } from "react";
import { Chess } from "chess.js";
import type { Resposta } from "../types";
import { Sprite } from "../pixel/Sprite";
import { AVATARES } from "../pixel/sprites";
import { sanEmPortugues } from "../demonstracao";
import { textoDaAnalise } from "../idioma";

export type MatchSide = "w" | "b";
const agent = { w: { nome: "Magnus", lado: "Brancas", sprite: "gelo" }, b: { nome: "Hans", lado: "Pretas", sprite: "fogo" } } as const;

export const PixelAvatar = memo(function PixelAvatar({ side, size = 64, context }: { side: MatchSide; size?: number; context?: string }) {
  const sprite = AVATARES[agent[side].sprite];
  return <span className="pixel-avatar" style={{ width: size, height: size }}><Sprite grade={sprite.grade} paleta={sprite.paleta} rotulo={`avatar do ${agent[side].nome}${context ? ` ${context}` : ""}`} /></span>;
});
export function AgentHeaderCard({ side, active, seconds }: { side: MatchSide; active: boolean; seconds: number }) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return <section className={`agent-header agent--${side} ${active ? "agent-active" : ""}`} aria-label={`${agent[side].nome} — ${agent[side].lado}`} data-active={active}>
    <PixelAvatar side={side} />
    <div><h2>{agent[side].nome}</h2><p>{agent[side].lado} {active && <span className="turn-tag">· Sua vez</span>}</p></div>
    <div className="agent-clock" title="Tempo de atividade por lado nesta partida; não é um relógio de competição"><strong>{minutes}:{(seconds % 60).toString().padStart(2, "0")}</strong><small>Tempo de atividade</small></div>
  </section>;
}
export function CurrentTurn({ side, label }: { side: MatchSide; label?: string }) {
  return <section className={`current-turn agent--${side}`} aria-label="Turno atual"><span className="eyebrow">{label ?? "Turno atual"}</span><div><PixelAvatar side={side} size={36} context="no turno atual" /><p><strong>{agent[side].nome}</strong><span>{agent[side].lado}</span></p></div></section>;
}
export interface RecordedMove { san: string; source: string; destination: string; fen: string }
/** Apresenta somente lances que já existem no histórico local de posições. */
export function recordedMoves(positions: string[]): RecordedMove[] {
  return positions.slice(1).flatMap((fen, i) => {
    try {
      const move = new Chess(positions[i]).moves({ verbose: true }).find(move => move.after === fen);
      return move ? [{ san: move.san, source: move.from, destination: move.to, fen }] : [];
    } catch { return []; }
  });
}
export function MoveHistory({ moves, selected, onSelect, disabled = false }: { moves: RecordedMove[]; selected: number; onSelect: (index: number) => void; disabled?: boolean }) {
  const [expanded, setExpanded] = useState(() => !window.matchMedia("(max-width: 899px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const update = () => setExpanded(!media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return <section id="historico-partida" className={`move-history${moves.length === 0 ? " move-history--empty" : ""}`} aria-label="Histórico de jogadas"><details className="history-disclosure" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary><h2>Histórico de jogadas <span>{moves.length}</span></h2></summary>
    <div className="move-history-scroll">{moves.length === 0 ? <p className="empty-note">Nenhuma jogada ainda.</p> : <ol>
      {Array.from({ length: Math.ceil(moves.length / 2) }, (_, row) => <li key={row}><span className="move-number">{row + 1}.</span>{[row * 2, row * 2 + 1].map(index => moves[index] ? <button type="button" key={index} disabled={disabled} className={selected === index + 1 ? "move-selected" : ""} aria-current={selected === index + 1 ? "step" : undefined} aria-label={`Ver posição após ${sanEmPortugues(moves[index].san)}, jogada ${index + 1}`} onClick={() => onSelect(index + 1)}>{sanEmPortugues(moves[index].san)}{index === moves.length - 1 && <span className="last-move-dot" aria-label="Último lance">·</span>}</button> : <span key={index}>—</span>)}</li>)}
    </ol>}</div></details>
  </section>;
}
export function AgentThinking({ side, analysis, busy = false, stale = false }: { side: MatchSide; analysis?: Resposta; busy?: boolean; stale?: boolean }) {
  const text = analysis ? textoDaAnalise(analysis.resposta) : "";
  const best = text.match(/^Melhor lance[^:]*:\s*(.+)$/m)?.[1];
  const evaluation = text.match(/^Avaliação:\s*(.+)$/m)?.[1];
  const line = text.match(/^Linha principal:\s*(.+)$/m)?.[1];
  const explanation = text.split("Por que esse lance: ")[1]?.split("\n\nPrática relacionada:")[0];
  return <section id={`agente-${side}`} className={`agent-thinking agent--${side}${analysis ? " agent-thinking--received" : " agent-thinking--empty"}`} aria-label={`Análise de ${agent[side].nome}`}>
    <header><PixelAvatar side={side} size={36} context="no painel de análise" /><div><h2>{agent[side].nome}</h2><p>{agent[side].lado}</p></div><span className={`thinking-status ${busy ? "thinking-busy" : ""}`} role="status">{busy ? "Analisando…" : analysis ? "Análise recebida" : "Esperando"}</span></header>
    {busy && <p className="thinking-notice">Consultando o sistema<span className="thinking-dots" aria-hidden="true">…</span></p>}
    {analysis ? <div className="thinking-content">{stale && <p className="analysis-age">Análise de uma posição anterior.</p>}
      {best && <div className="candidate"><span>Melhor lance</span><strong>{best}</strong></div>}
      {evaluation && <p className="evaluation"><strong>Avaliação</strong><span>{evaluation}</span></p>}
      <p className="thinking-preview">{explanation ?? text}</p>
      <details className="thinking-details">
        <summary>Ver detalhes</summary>
        {line && <p className="principal-line"><strong>Linha principal: </strong>{line}</p>}
        <p className="thinking-full-text">{text}</p>
        <small>Dados recebidos do sistema · consulte as fontes no tutor.</small>
      </details>
    </div> : <p className="thinking-empty">Nenhuma análise ainda.</p>}
  </section>;
}

export function Sidebar() {
  return <aside className="arena-sidebar" aria-label="Navegação da arena"><span className="sidebar-caption">ARENA</span><nav><a href="#partida" aria-current="page"><span aria-hidden="true">♜</span>Partida</a><a href="#historico-partida"><span aria-hidden="true">▤</span>Histórico</a><a href="#agentes"><span aria-hidden="true">♟</span>Agentes</a><a href="#sobre-projeto"><span aria-hidden="true">▣</span>Sobre o projeto</a></nav><details className="arena-preferences"><summary>⚙ Configurações</summary><p>As animações respeitam a preferência de movimento reduzido do seu dispositivo.</p><p>Relógios mostram tempo de atividade, sem limite de competição.</p></details><div className="sidebar-bottom"><span aria-hidden="true">♔</span><strong>Seu próximo<br />grande lance.</strong><p>Explore. Aprenda. Jogue.</p></div></aside>;
}
