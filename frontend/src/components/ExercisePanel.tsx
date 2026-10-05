import { textoPedagogico } from "../idioma";
import { useEffect, useState } from "react";
import { api } from "../api";
import { lerUsuarioId } from "../armazenamento";
import type { Exibicao } from "./Board";
import type { ExerciseAction, ExerciseProgress } from "../types";
import type { ExerciseState } from "../exercises/estado";
import type { ExerciseVisual } from "../exercises/visual";
import { EXERCISE_LABELS, feedbackDosFacts } from "../exercises/pedagogia";
import { passosDaRefutacao } from "../exercises/refutacao";
import { sanEmPortugues } from "../demonstracao";

export type PanelStatus = "idle" | "loading" | "active" | "partial" | "correct" | "incorrect" | "operational_error";
export function statusDoPainel(state: ExerciseState): PanelStatus {
  if (state.loading) return "loading";
  if (state.operationalError) return "operational_error";
  return state.validationResult?.status ?? (state.exercise ? "active" : "idle");
}
const STATUS_TEXT: Record<PanelStatus, string> = {
  idle: "Escolha um exercício para começar.", loading: "Carregando exercício…",
  active: "Exercício aguardando resposta.", partial: "Boa. Agora continue.",
  correct: "Exercício concluído.", incorrect: "Tente novamente.", operational_error: "Erro operacional.",
};
interface Props {
  state: ExerciseState;
  visual: ExerciseVisual;
  onAction: (action: ExerciseAction) => void;
  onHint?: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPreview: (position: Exibicao | null) => void;
}
export function ExercisePanel({ state, visual, onAction, onHint, onClose, onRetry, onPreview }: Props) {
  const status = statusDoPainel(state);
  const [passo, setPasso] = useState<number | null>(null);
  const [progress, setProgress] = useState<ExerciseProgress | null>(null);
  const [progressError, setProgressError] = useState(false);
  const usuarioId = lerUsuarioId();
  const exercise = state.exercise;
  const passos = passosDaRefutacao(state.validationResult);
  useEffect(() => { setPasso(null); onPreview(null); }, [state.validationResult, onPreview]);
  useEffect(() => {
    let vigente = true;
    setProgress(null); setProgressError(false);
    if (!exercise) return;
    api.progressoExercicios(usuarioId ?? undefined).then((rows) => {
      if (vigente) setProgress(rows.find((row) => row.exercise_id === exercise.id) ?? null);
    }).catch(() => { if (vigente) setProgressError(true); });
    return () => { vigente = false; };
  }, [usuarioId, exercise, state.validationResult]);
  if (status === "idle") return null;
  const bloqueado = state.loading || state.concluido;
  function ir(index: number | null) {
    setPasso(index);
    onPreview(index === null ? null : passos[index]);
  }
  return <section aria-label="Exercício" className={"mission-panel caixa-pixel p-4 mission--" + status} data-status={status}>
    <p className="font-pixel text-[0.55rem] text-gelo-escuro">MISSÃO · EXERCÍCIO</p>
    {exercise && <>
      <h2 className="mt-2 text-sm font-bold">{EXERCISE_LABELS[exercise.id]?.nome ?? "Exercício de xadrez"}</h2>
      <p className="text-xs text-slate-600">Conceito: {EXERCISE_LABELS[exercise.id]?.conceito ?? "Prática relacionada"}</p>
      <p className="mt-2 text-sm"><strong>Objetivo: </strong>{textoPedagogico(exercise.prompt)}</p>
    </>}
    <div role="status" aria-live="polite" className="mission-status mt-3 text-sm">
      {status === "active" && <span>Sua vez · </span>}
      {state.operationalError && !state.loading ? state.operationalError.message : STATUS_TEXT[status]}
    </div>
    {status !== "operational_error" && status !== "loading" && <div className="pedagogical-feedback">
      {state.validationResult && <p className="support-label">Sobre sua tentativa</p>}
      {feedbackDosFacts(state.validationResult?.facts ?? []).map((text) => <p key={text} className="mt-1 text-sm">{text}</p>)}
      {visual.opponentMoves.length > 0 && <p className="mt-1 text-sm">Resposta adversária aplicada: {visual.opponentMoves.join(", ")} (UCI).</p>}
      {status === "partial" && <p className="text-sm">É sua vez de continuar: capture um dos alvos para atingir o objetivo.</p>}
      {visual.materialDelta !== null && <p className="text-sm">Variação material da linha: {visual.materialDelta > 0 ? "+" : ""}{visual.materialDelta}.</p>}
    </div>}
    {state.hint && <div aria-label="Dica do exercício" aria-live="polite" className="mt-3 text-sm">
      <p><strong>Dica {state.hint.level}: </strong>{state.hint.text ? textoPedagogico(state.hint.text) : "Observe as casas destacadas."}</p>
      {state.hint.highlight_squares.length > 0 && <p>Casas da dica: {state.hint.highlight_squares.join(", ")}.</p>}
    </div>}
    {exercise && onHint && !state.concluido && <button type="button" className="botao-pixel mt-2 bg-gelo text-slate-900"
      disabled={state.loading || state.currentHintLevel === 3} onClick={() => { ir(null); onHint(); }}>
      {state.currentHintLevel === 0 ? "Ver dica" : state.currentHintLevel === 3 ? "Todas as dicas exibidas" : "Ver próxima dica"}
    </button>}
    {exercise?.goal.type === "answer_position_question" && <div className="answer-actions mt-3 flex gap-3">
      <button type="button" className="botao-pixel bg-gelo text-slate-900" disabled={bloqueado} onClick={() => onAction({ type: "answer", answer: true })}>SIM</button>
      <button type="button" className="botao-pixel bg-slate-200 text-slate-900" disabled={bloqueado} onClick={() => onAction({ type: "answer", answer: false })}>NÃO</button>
    </div>}
    {status === "operational_error" && <p className="mt-1 text-xs">Não houve avaliação pedagógica dessa requisição.</p>}
    {status === "operational_error" && <button type="button" className="botao-pixel mt-2 bg-gelo text-slate-900" onClick={onRetry}>{exercise ? "Recarregar exercício" : "Tentar carregar novamente"}</button>}
    {status !== "operational_error" && !state.loading && passos.length > 1 && <div className="replay-panel mt-3">
      <p className="text-xs">Refutação recebida do servidor; a posição do exercício permanece guardada.</p>
      {passo === null ? <button type="button" className="botao-pixel mt-2 bg-slate-200 text-slate-900" onClick={() => ir(0)}>Ver sequência de refutação</button> : <>
        <p aria-live="polite" className="mt-2 text-sm">{passo === 0 ? "Posição antes da tentativa" : `Lance ${passo}/${passos.length - 1}: ${sanEmPortugues(passos[passo].san ?? "")}`}</p>
        <p className="mt-1 text-xs">Passo {passo}/{passos.length - 1}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="botao-pixel bg-slate-200 text-slate-900" disabled={passo === 0} onClick={() => ir(passo - 1)}>Anterior na refutação</button>
          <button type="button" className="botao-pixel bg-slate-200 text-slate-900" disabled={passo === passos.length - 1} onClick={() => ir(passo + 1)}>Próximo na refutação</button>
          <button type="button" className="botao-pixel bg-gelo text-slate-900" onClick={() => ir(null)}>Voltar ao exercício</button>
        </div>
      </>}
    </div>}
    {progress && <p className="mt-3 text-xs">Progresso: {progress.status === "completed" ? "concluído" : "não concluído"} · Tentativas: {progress.attempts}</p>}
    {progressError && <p className="mt-3 text-xs">Não foi possível consultar o progresso.</p>}
    <button type="button" className="botao-pixel mt-3 bg-fogo text-slate-900" onClick={onClose}>Fechar exercício e voltar à minha posição</button>
  </section>;
}
