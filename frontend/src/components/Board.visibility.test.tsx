import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ChessboardOptions } from "react-chessboard";
const board = vi.hoisted(() => {
  // Este cenário precisa de animação habilitada; os outros testes usam movimento reduzido.
  window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false });
  return { options: null as ChessboardOptions | null };
});
vi.mock("react-chessboard", () => ({ Chessboard: ({ options }: { options: ChessboardOptions }) => { board.options = options; return <div />; } }));
import { Board } from "./Board";
import { FEN_INICIAL } from "../lances";
const normal = { fen: FEN_INICIAL, ocupado: false, podeDesfazer: false, onLance: vi.fn(), onDesfazer: vi.fn(), onReiniciar: vi.fn(), onAnalisar: vi.fn() };
it("arena visível mantém animações habilitadas", () => {
  render(<Board {...normal} visible />); expect(board.options?.showAnimations).toBe(true);
});
it("posição que chega na arena oculta não tenta animar casas sem largura", () => {
  const view = render(<Board {...normal} visible={false} />);
  view.rerender(<Board {...normal} visible={false} fen="rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" />);
  expect(board.options?.showAnimations).toBe(false);
  expect(board.options?.position).toContain("4P3");
});
it("retornar à arena restaura animações sem alterar a posição oficial", () => {
  const view = render(<Board {...normal} visible={false} />); view.rerender(<Board {...normal} visible />);
  expect(board.options?.showAnimations).toBe(true); expect(board.options?.position).toBe(FEN_INICIAL);
});
