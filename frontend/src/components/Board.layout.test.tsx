import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Board } from "./Board";
import { FEN_INICIAL } from "../lances";

it("preserva as 64 casas e as coordenadas no tabuleiro real", () => {
  const { container } = render(<Board modo="normal" fen={FEN_INICIAL} ocupado={false} podeDesfazer={false}
    onLance={vi.fn()} onDesfazer={vi.fn()} onReiniciar={vi.fn()} onAnalisar={vi.fn()} />);
  const squares = container.querySelectorAll('[data-square]');
  expect(squares).toHaveLength(64);
  expect(new Set(Array.from(squares, square => square.getAttribute('data-square'))).size).toBe(64);
  for (const square of ['a1', 'a8', 'h1', 'h8']) expect(container.querySelector(`[data-square="${square}"]`)).toBeTruthy();
});
