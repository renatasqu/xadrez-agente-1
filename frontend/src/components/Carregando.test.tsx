import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Carregando } from "./Carregando";
import { textoDaEtapa } from "./etapas";

afterEach(() => vi.useRealTimers());

it("o texto muda conforme o tempo passa", () => {
  expect(textoDaEtapa("analise", 0)).toBe("O Stockfish está calculando…");
  expect(textoDaEtapa("analise", 5)).toBe("O Estrategista está pensando…");
  expect(textoDaEtapa("chat", 25)).toBe("Quase lá…");
});

it("mostra os segundos e troca de etapa", () => {
  vi.useFakeTimers();
  render(<Carregando tipo="analise" />);
  expect(screen.getByText("O Stockfish está calculando…")).toBeTruthy();
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.getByText("O Estrategista está pensando…")).toBeTruthy();
  expect(screen.getByText("4s")).toBeTruthy();
});
