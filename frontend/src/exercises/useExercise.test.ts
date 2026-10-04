import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, ErroDeExercicio } from "../api";
import { A1, A3, PARTIAL } from "../testes/exercises";
import type { ValidationResult } from "../types";
import { useExercise } from "./useExercise";

afterEach(() => vi.restoreAllMocks());
it.each(["correct", "incorrect", "partial"] as const)("%s usa FEN e history do servidor", async (status) => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A3);
  const response: ValidationResult = { ...PARTIAL, status };
  const validate = vi.spyOn(api, "validarExercicio").mockResolvedValue(response);
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar(A3.id));
  await act(async () => hook.result.current.tentar({ type: "move", source: "b5", destination: "c7" }));
  expect(hook.result.current.resulting_fen).toBe(response.resulting_fen);
  expect(hook.result.current.history).toEqual(response.history);
  expect(hook.result.current.concluido).toBe(status === "correct");
  expect(hook.result.current.validationResult).toEqual(response);
  if (status === "partial") {
    validate.mockResolvedValue({ ...PARTIAL, status: "correct", history: [...PARTIAL.history, "c7a8", "d7c6"] });
    await act(async () => hook.result.current.tentar({ type: "move", source: "c7", destination: "a8" }));
    expect(validate.mock.calls[1][1].history).toEqual(PARTIAL.history);
    expect(hook.result.current.concluido).toBe(true);
  }
});
it("erro operacional preserva posição e resultado anterior sem virar incorrect", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A3);
  const validate = vi.spyOn(api, "validarExercicio").mockResolvedValue(PARTIAL);
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar(A3.id));
  await act(async () => hook.result.current.tentar({ type: "move", source: "b5", destination: "c7" }));
  const error = { code: "invalid_history" as const, message: "Histórico inválido" };
  validate.mockRejectedValue(new ErroDeExercicio(error, 422));
  await act(async () => hook.result.current.tentar({ type: "move", source: "c7", destination: "a8" }));
  expect(hook.result.current.operationalError).toEqual(error);
  expect(hook.result.current.validationResult?.status).toBe("partial");
  expect(hook.result.current.resulting_fen).toBe(PARTIAL.resulting_fen);
  expect(hook.result.current.history).toEqual(PARTIAL.history);
  expect(hook.result.current.concluido).toBe(false);
  expect(hook.result.current.loading).toBe(false);
});
it("A2 envia resposta booleana pelo mesmo estado", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue({ ...A1, id: "a2-roque-pequeno",
    goal: { type: "answer_position_question", question: "can_castle", side: "kingside" } });
  const validate = vi.spyOn(api, "validarExercicio").mockResolvedValue({ ...PARTIAL, status: "correct", history: [] });
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar("a2-roque-pequeno"));
  await act(async () => hook.result.current.tentar({ type: "answer", answer: true }));
  expect(validate).toHaveBeenCalledWith("a2-roque-pequeno", { version: 1, action: { type: "answer", answer: true }, history: [] });
});
it("resposta atrasada da validação não sobrescreve outro exercício", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValueOnce(A3).mockResolvedValueOnce(A1);
  let resolve!: (result: ValidationResult) => void;
  vi.spyOn(api, "validarExercicio").mockImplementation(() => new Promise((done) => { resolve = done; }));
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar(A3.id));
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.tentar({ type: "move", source: "b5", destination: "c7" }); });
  expect(hook.result.current.loading).toBe(true);
  await act(async () => hook.result.current.carregar(A1.id));
  await act(async () => { resolve(PARTIAL); await pending; });
  expect(hook.result.current.exercise).toEqual(A1);
  expect(hook.result.current.resulting_fen).toBe(A1.fen);
  expect(hook.result.current.history).toEqual([]);
});
it("fechar ignora resposta de carregamento atrasada", async () => {
  let resolve!: (value: typeof A1) => void;
  vi.spyOn(api, "exercicio").mockImplementation(() => new Promise((done) => { resolve = done; }));
  const hook = renderHook(() => useExercise());
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.carregar(A1.id); });
  act(() => hook.result.current.fechar());
  await act(async () => { resolve(A1); await pending; });
  expect(hook.result.current.exercise).toBeNull();
  expect(hook.result.current.resulting_fen).toBeNull();
});
it("cliques simultâneos produzem uma única validação", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A1);
  const validate = vi.spyOn(api, "validarExercicio").mockResolvedValue(PARTIAL);
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar(A1.id));
  await act(async () => Promise.all([
    hook.result.current.tentar({ type: "move", source: "b1", destination: "b3" }),
    hook.result.current.tentar({ type: "move", source: "b1", destination: "c3" }),
  ]));
  expect(validate).toHaveBeenCalledTimes(1);
});

it("dicas explícitas avançam, incorrect permite nova tentativa e correct encerra", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A1);
  const validate = vi.spyOn(api, "validarExercicio").mockResolvedValue({ status: "incorrect", resulting_fen: A1.fen, history: [],
    facts: [{ code: "straight_knight_move", source: "b1", destination: "b3" }], next_hint: null });
  const hints = vi.spyOn(api, "dicaExercicio")
    .mockResolvedValueOnce({ next_hint: { level: 1, code: "conceptual", text: "Conceito", highlight_squares: [] } })
    .mockResolvedValueOnce({ next_hint: { level: 2, code: "piece_or_region", text: "Região", highlight_squares: ["b1"] } })
    .mockResolvedValueOnce({ next_hint: { level: 3, code: "specific_squares", text: "Destino", highlight_squares: ["c3"] } });
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar(A1.id));
  await act(async () => hook.result.current.tentar({ type: "move", source: "b1", destination: "b3" }));
  expect(hints).not.toHaveBeenCalled();
  for (const n of [0, 1, 2]) {
    await act(async () => hook.result.current.pedirDica());
    expect(hints.mock.calls[n][1]).toEqual({ version: 1, history: [], last_action: { type: "move", source: "b1", destination: "b3" }, current_hint_level: n });
    expect(hook.result.current.currentHintLevel).toBe(n + 1);
  }
  expect(hook.result.current.visual.hintSquares).toEqual(["c3"]);
  expect(hook.result.current.visual.destinationSquare).toBe("b3");
  await act(async () => hook.result.current.pedirDica());
  expect(hints).toHaveBeenCalledTimes(3);
  await act(async () => hook.result.current.tentar({ type: "move", source: "b1", destination: "b3" }));
  expect(hook.result.current.currentHintLevel).toBe(0);
  expect(hook.result.current.hint).toBeNull();
  expect(hook.result.current.resulting_fen).toBe(A1.fen);
  validate.mockResolvedValue({ status: "correct", resulting_fen: "server-fen", history: [], facts: [], next_hint: null });
  await act(async () => hook.result.current.tentar({ type: "move", source: "b1", destination: "c3" }));
  expect(hook.result.current.concluido).toBe(true);
  await act(async () => hook.result.current.tentar({ type: "move", source: "b1", destination: "c3" }));
  await act(async () => hook.result.current.pedirDica());
  expect(validate).toHaveBeenCalledTimes(3);
  expect(hints).toHaveBeenCalledTimes(3);
});

it("A3 reseta dicas ao avançar e solicita dica sem ação aceita no novo estágio", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A3);
  vi.spyOn(api, "validarExercicio").mockResolvedValue(PARTIAL);
  const hints = vi.spyOn(api, "dicaExercicio").mockResolvedValue({ next_hint: { level: 1, code: "conceptual", text: "Garfo", highlight_squares: [] } });
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar(A3.id));
  await act(async () => hook.result.current.pedirDica());
  await act(async () => hook.result.current.tentar({ type: "move", source: "b5", destination: "c7" }));
  expect(hook.result.current.currentHintLevel).toBe(0);
  await act(async () => hook.result.current.pedirDica());
  expect(hints.mock.calls[1][1]).toEqual({ version: 1, history: PARTIAL.history, last_action: null, current_hint_level: 0 });
  expect(hook.result.current.validationResult).toEqual(PARTIAL);
  expect(hook.result.current.resulting_fen).toBe(PARTIAL.resulting_fen);
});

it("dica atrasada não altera exercício reaberto", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A1);
  let resolve!: (value: { next_hint: null }) => void;
  vi.spyOn(api, "dicaExercicio").mockImplementation(() => new Promise(done => { resolve = done; }));
  const hook = renderHook(() => useExercise());
  await act(async () => hook.result.current.carregar(A1.id));
  let pending!: Promise<void>;
  act(() => { pending = hook.result.current.pedirDica(); });
  await act(async () => hook.result.current.carregar(A1.id));
  await act(async () => { resolve({ next_hint: null }); await pending; });
  expect(hook.result.current.currentHintLevel).toBe(0);
});
