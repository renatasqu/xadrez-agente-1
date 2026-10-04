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

it("apresenta Ver dica, próxima dica e limite sem encerrar a tentativa", () => {
  const onHint = vi.fn();
  const state = { ...estadoInicial, exercise: A1 };
  const props = { visual: factsParaVisual([]), onHint, onAction: vi.fn(), onClose: vi.fn(), onRetry: vi.fn(), onPreview: vi.fn() };
  const view = render(<ExercisePanel state={state} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver dica" }));
  expect(onHint).toHaveBeenCalledTimes(1);
  view.rerender(<ExercisePanel state={{ ...state, currentHintLevel: 1,
    hint: { level: 1, code: "conceptual", text: "Observe o movimento", highlight_squares: [] } }} {...props} />);
  expect(screen.getByText("Observe o movimento")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ver próxima dica" }));
  expect(onHint).toHaveBeenCalledTimes(2);
  view.rerender(<ExercisePanel state={{ ...state, currentHintLevel: 3,
    hint: { level: 3, code: "specific_squares", text: "Observe c3", highlight_squares: ["c3"] } }} {...props} />);
  expect(screen.getByText("Casas da dica: c3.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Todas as dicas exibidas" }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<ExercisePanel state={{ ...state, concluido: true }} {...props} />);
  expect(screen.queryByRole("button", { name: "Ver dica" })).toBeNull();
});
