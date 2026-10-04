import type { Exercise, ExerciseError, ValidationResult, ExerciseAction, ExerciseHint } from "../types";

export interface ExerciseState {
  hint: ExerciseHint | null;
  currentHintLevel: 0 | 1 | 2 | 3;
  lastAction: ExerciseAction | null;
  exercise: Exercise | null;
  loading: boolean;
  validationResult: ValidationResult | null;
  resulting_fen: string | null;
  history: string[];
  operationalError: ExerciseError | null;
  concluido: boolean;
}
export const estadoInicial: ExerciseState = {
  hint: null, currentHintLevel: 0, lastAction: null,
  exercise: null, loading: false, validationResult: null, resulting_fen: null,
  history: [], operationalError: null, concluido: false,
};
export type ExerciseEvent =
  | { type: "carregar" }
  | { type: "carregado"; exercise: Exercise }
  | { type: "validar"; action: ExerciseAction }
  | { type: "pedir_dica" }
  | { type: "dica"; hint: ExerciseHint | null }
  | { type: "validado"; result: ValidationResult }
  | { type: "erro"; error: ExerciseError }
  | { type: "fechar" };

export function reduzirExercicio(state: ExerciseState, event: ExerciseEvent): ExerciseState {
  switch (event.type) {
    case "carregar": return { ...estadoInicial, history: [], loading: true };
    case "carregado": return { ...estadoInicial, history: [], exercise: event.exercise, resulting_fen: event.exercise.fen };
    case "validar": return { ...state, loading: true, operationalError: null, hint: null, currentHintLevel: 0, lastAction: event.action };
    case "pedir_dica": return { ...state, loading: true, operationalError: null };
    case "dica": return { ...state, loading: false, hint: event.hint, currentHintLevel: event.hint?.level ?? 3 };
    case "validado": return {
      ...state, loading: false, validationResult: event.result,
      hint: null, currentHintLevel: 0, lastAction: event.result.status === "incorrect" ? state.lastAction : null,
      resulting_fen: event.result.resulting_fen, history: [...event.result.history],
      operationalError: null, concluido: state.concluido || event.result.status === "correct",
    };
    case "erro": return { ...state, loading: false, operationalError: event.error };
    case "fechar": return { ...estadoInicial, history: [] };
  }
}
