import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ExercisePanel, statusDoPainel } from "./ExercisePanel";
import { estadoInicial } from "../exercises/estado";
import { factsParaVisual } from "../exercises/visual";
import { A1 } from "../testes/exercises";

it("distingue todos os estados e dá prioridade ao erro operacional", () => {
  expect(statusDoPainel(estadoInicial)).toBe("idle");
  expect(statusDoPainel({ ...estadoInicial, loading: true })).toBe("loading");
  expect(statusDoPainel({ ...estadoInicial, exercise: A1 })).toBe("active");
  for (const status of ["partial", "correct", "incorrect"] as const) {
    const state = { ...estadoInicial, validationResult: { status, resulting_fen: A1.fen, history: [], facts: [], next_hint: null } };
    expect(statusDoPainel(state)).toBe(status);
    expect(statusDoPainel({ ...state, operationalError: { code: "invalid_request", message: "API" } })).toBe("operational_error");
  }
});
it("falha de carregamento oferece retry sem erro pedagógico", () => {
  const retry = vi.fn(); const close = vi.fn();
  render(<ExercisePanel state={{ ...estadoInicial, operationalError: { code: "exercise_not_found", message: "Exercício indisponível." } }}
    visual={factsParaVisual([])} onAction={vi.fn()} onClose={close} onRetry={retry} onPreview={vi.fn()} />);
  expect(screen.getByText("Exercício indisponível.")).toBeTruthy();
  expect(screen.queryByText("Tente novamente.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tentar carregar novamente" }));
  expect(retry).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Fechar exercício e voltar à minha posição" }));
  expect(close).toHaveBeenCalledTimes(1);
});
it("loading é anunciado e permite fechar", () => {
  const close = vi.fn();
  render(<ExercisePanel state={{ ...estadoInicial, loading: true }} visual={factsParaVisual([])}
    onAction={vi.fn()} onClose={close} onRetry={vi.fn()} onPreview={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toContain("Carregando exercício");
  fireEvent.click(screen.getByRole("button", { name: "Fechar exercício e voltar à minha posição" }));
  expect(close).toHaveBeenCalledTimes(1);
});
for (const [status, texto] of [["correct", "Exercício concluído."], ["incorrect", "Tente novamente."], ["partial", "Boa. Agora continue."]] as const) {
  it(`missão ${status} mantém anúncio textual sem depender da cor`, () => {
    render(<ExercisePanel state={{ ...estadoInicial, exercise: A1,
      validationResult: { status, resulting_fen: A1.fen, history: [], facts: [], next_hint: null } }}
      visual={factsParaVisual([])} onAction={vi.fn()} onClose={vi.fn()} onRetry={vi.fn()} onPreview={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toContain(texto);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("region", { name: "Exercício" }).getAttribute("data-status")).toBe(status);
  });
}
