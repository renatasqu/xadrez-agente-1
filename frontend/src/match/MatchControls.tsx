import { BoardControls } from "../components/BoardControls";
export function MatchControls({ study = false, index, total, paused, disabled, onFirst, onPrevious, onToggle, onNext, onLive, onUndo, onReset, onAnalyze }:
  { study?: boolean; index: number; total: number; paused: boolean; disabled: boolean; onFirst: () => void; onPrevious: () => void; onToggle: () => void; onNext: () => void; onLive: () => void; onUndo: () => void; onReset: () => void; onAnalyze: () => void }) {
  return <section className="match-controls" aria-label={study ? "Controles da prática" : "Controles da partida"}><div className="navigation-controls">
    <button type="button" disabled={disabled || index === 0} onClick={onFirst}><span aria-hidden="true">|◀</span>Primeira posição</button>
    <button type="button" disabled={disabled || index === 0} onClick={onPrevious}><span aria-hidden="true">◀</span>Anterior</button>
    <button type="button" className="control-primary" disabled={disabled} onClick={onToggle}><span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Continuar" : study ? "Pausar exploração" : "Pausar partida"}</button>
    <button type="button" disabled={disabled || index === total} onClick={onNext}><span aria-hidden="true">▶|</span>Próxima</button>
  </div><BoardControls ocupado={disabled || index < total} podeDesfazer={total > 0} onAnalisar={onAnalyze} onDesfazer={onUndo} onReiniciar={onReset} />
    {index < total && <button type="button" className="return-live" onClick={onLive}>Voltar à posição atual</button>}
  </section>;
}
