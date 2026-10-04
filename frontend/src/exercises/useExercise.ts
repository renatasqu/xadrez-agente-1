import { useEffect, useReducer, useRef } from "react";
import { api, ErroDeExercicio } from "../api";
import type { ExerciseAction, ExerciseError } from "../types";
import { estadoInicial, reduzirExercicio, type ExerciseEvent } from "./estado";
import { factsParaVisual } from "./visual";

function erroOperacional(error: unknown): ExerciseError {
  return error instanceof ErroDeExercicio ? error.erro : {
    code: "internal_error", message: "Não foi possível processar o exercício. Tente de novo.",
  };
}

/** Uma sessão isolada. Respostas antigas e cliques simultâneos não sobrescrevem a sessão atual. */
export function useExercise() {
  const [state, dispatch] = useReducer(reduzirExercicio, estadoInicial);
  const atual = useRef(state);
  const geracao = useRef(0);
  const ocupado = useRef(false);
  useEffect(() => () => { geracao.current++; }, []);

  function aplicar(event: ExerciseEvent) {
    atual.current = reduzirExercicio(atual.current, event);
    dispatch(event);
  }
  async function carregar(id: string) {
    const token = ++geracao.current;
    ocupado.current = true;
    aplicar({ type: "carregar" });
    try {
      const exercise = await api.exercicio(id);
      if (token === geracao.current) aplicar({ type: "carregado", exercise });
    } catch (error) {
      if (token === geracao.current) aplicar({ type: "erro", error: erroOperacional(error) });
    } finally {
      if (token === geracao.current) ocupado.current = false;
    }
  }
  async function tentar(action: ExerciseAction) {
    const { exercise, history, concluido } = atual.current;
    if (!exercise || ocupado.current || concluido) return;
    const token = geracao.current;
    ocupado.current = true;
    aplicar({ type: "validar" });
    try {
      const result = await api.validarExercicio(exercise.id, { version: exercise.version, action, history });
      if (token === geracao.current) aplicar({ type: "validado", result });
    } catch (error) {
      if (token === geracao.current) aplicar({ type: "erro", error: erroOperacional(error) });
    } finally {
      if (token === geracao.current) ocupado.current = false;
    }
  }
  function fechar() {
    geracao.current++;
    ocupado.current = false;
    aplicar({ type: "fechar" });
  }
  return { ...state, visual: factsParaVisual(state.validationResult?.facts ?? []), carregar, tentar, fechar };
}
