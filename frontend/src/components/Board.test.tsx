import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ChessboardOptions } from "react-chessboard";
import { Board } from "./Board";
import { FEN_INICIAL } from "../lances";
import { A1, PARTIAL } from "../testes/exercises";
import { factsParaVisual } from "../exercises/visual";

const board = vi.hoisted(() => ({ options: null as ChessboardOptions | null }));
vi.mock("react-chessboard", () => ({ Chessboard: ({ options }: { options: ChessboardOptions }) => {
  board.options = options;
  return <div>{["b1", "b3", "c3", "e2", "e4", "e5"].map((square) =>
    <button key={square} onClick={() => options.onSquareClick?.({ square, piece: null })}>{square}</button>)}</div>;
} }));
function props() {
  return { fen: FEN_INICIAL, ocupado: false, podeDesfazer: true,
    onLance: vi.fn(), onDesfazer: vi.fn(), onReiniciar: vi.fn(), onAnalisar: vi.fn() };
}
function click(source: string, destination: string) {
  fireEvent.click(screen.getByText(source)); fireEvent.click(screen.getByText(destination));
}
it("NORMAL rejeita lance ilegal e somente lance legal altera partida", () => {
  const normal = props();
  render(<Board {...normal} modo="normal" />);
  click("e2", "e5"); expect(normal.onLance).not.toHaveBeenCalled();
  click("e2", "e4");
  expect(normal.onLance).toHaveBeenCalledTimes(1);
  expect(normal.onLance.mock.calls[0][0]).toContain("4P3");
});
it("EXERCISE envia clique ilegal sem chamar callbacks da partida", () => {
  const normal = props(); const onTentativa = vi.fn();
  render(<Board {...normal} modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: false, onTentativa }} />);
  expect(board.options?.position).toBe(A1.fen);
  click("b1", "b3");
  expect(onTentativa).toHaveBeenCalledWith({ type: "move", source: "b1", destination: "b3" });
  expect(normal.onLance).not.toHaveBeenCalled();
  for (const label of ["Analisar posição", "Desfazer", "Reiniciar"]) {
    expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
  }
  expect(normal.onDesfazer).not.toHaveBeenCalled();
});
it("EXERCISE envia drag ilegal e espera FEN do servidor", () => {
  const normal = props(); const onTentativa = vi.fn();
  const view = render(<Board {...normal} modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: false, onTentativa }} />);
  let accepted: boolean | undefined;
  act(() => { accepted = board.options?.onPieceDrop?.({ sourceSquare: "b1", targetSquare: "b3",
    piece: { pieceType: "wN", position: "b1", isSparePiece: false } }); });
  expect(accepted).toBe(false);
  expect(onTentativa).toHaveBeenCalledWith({ type: "move", source: "b1", destination: "b3" });
  expect(board.options?.position).toBe(A1.fen);
  expect(normal.onLance).not.toHaveBeenCalled();
  view.rerender(<Board {...normal} modo="exercise" exercicio={{ fen: PARTIAL.resulting_fen, goal: A1.goal, concluido: false, onTentativa }} />);
  expect(board.options?.position).toBe(PARTIAL.resulting_fen);
});
it("DEMONSTRATION bloqueia input e preserva FEN da partida ao voltar", () => {
  const normal = props();
  const view = render(<Board {...normal} modo="demonstration" exibicao={{ fen: A1.fen, de: "b1", para: "c3" }} />);
  expect(board.options?.position).toBe(A1.fen);
  expect(board.options?.allowDragging).toBe(false);
  click("b1", "c3"); expect(normal.onLance).not.toHaveBeenCalled();
  view.rerender(<Board {...normal} modo="normal" />);
  expect(board.options?.position).toBe(FEN_INICIAL);
});
it("A2 e exercício concluído não geram MoveAction", () => {
  const normal = props(); const onTentativa = vi.fn();
  const view = render(<Board {...normal} modo="exercise" exercicio={{ fen: A1.fen,
    goal: { type: "answer_position_question", question: "can_castle", side: "kingside" }, concluido: false, onTentativa }} />);
  click("b1", "c3"); expect(onTentativa).not.toHaveBeenCalled();
  view.rerender(<Board {...normal} modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: true, onTentativa }} />);
  click("b1", "c3"); expect(onTentativa).not.toHaveBeenCalled();
});
it("bloqueia input durante requisição e ignora origem vazia/mesma casa", () => {
  const normal = props(); const onTentativa = vi.fn();
  const view = render(<Board {...normal} ocupado modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: false, onTentativa }} />);
  click("b1", "b3"); expect(onTentativa).not.toHaveBeenCalled();
  view.rerender(<Board {...normal} modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: false, onTentativa }} />);
  click("b3", "c3"); click("b1", "b1"); expect(onTentativa).not.toHaveBeenCalled();
});
it("aplica projeção visual de facts sem reproduzir a linha", () => {
  const normal = props();
  const visual = factsParaVisual([{ code: "straight_knight_move", source: "b1", destination: "b3" }]);
  render(<Board {...normal} modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: false, visual, onTentativa: vi.fn() }} />);
  expect(board.options?.squareStyles?.b1).toHaveProperty("boxShadow");
  expect(board.options?.squareStyles?.b3).toHaveProperty("boxShadow");
  expect(board.options?.position).toBe(A1.fen);
});
it("mostra contexto acessível ao alternar PARTIDA, DEMONSTRAÇÃO e EXERCÍCIO", () => {
  const normal = props();
  const view = render(<Board {...normal} modo="normal" />);
  expect(screen.getByLabelText("Contexto do tabuleiro").textContent).toContain("PARTIDA");
  view.rerender(<Board {...normal} modo="demonstration" exibicao={{ fen: A1.fen, de: null, para: null }} />);
  expect(screen.getByLabelText("Contexto do tabuleiro").textContent).toContain("DEMONSTRAÇÃO");
  view.rerender(<Board {...normal} modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: false, onTentativa: vi.fn() }} />);
  expect(screen.getByLabelText("Contexto do tabuleiro").textContent).toContain("EXERCÍCIO");
});

it("dica distingue marcação e preserva destaques da tentativa e erro", () => {
  const visual = factsParaVisual([{ code: "straight_knight_move", source: "b1", destination: "b3" },
    { code: "transit_attacked", square: "c3" }]);
  visual.hintSquares = ["b1", "b3", "c3"];
  visual.errorSquares = ["b3"];
  const onTentativa = vi.fn();
  render(<Board {...props()} modo="exercise" exercicio={{ fen: A1.fen, goal: A1.goal, concluido: false, visual, onTentativa }} />);
  expect(board.options?.squareStyles?.b1).toHaveProperty("boxShadow");
  expect(board.options?.squareStyles?.b1).toHaveProperty("backgroundImage", "radial-gradient(circle, #16825d 2px, transparent 3px)");
  expect(board.options?.squareStyles?.c3).toHaveProperty("boxShadow", "inset 0 0 0 4px var(--perigo)");
  expect(board.options?.squareStyles?.c3).toHaveProperty("backgroundImage", "radial-gradient(circle, #16825d 2px, transparent 3px)");
  expect(board.options?.squareStyles?.b3).toHaveProperty("outline", "3px dashed var(--perigo)");
  expect(screen.getByText("Casas da dica: b1, b3, c3.")).toBeTruthy();
  click("b1", "c3");
  expect(onTentativa).toHaveBeenCalledOnce();
});

it("faixa de contexto reposicionada acompanha o modo sem duplicar textos", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const normal = props();
  const view = render(<Board {...normal} contextContainer={host} />);
  expect(host.textContent).toContain("PARTIDA");
  expect(host.textContent).toContain("Explore uma posição");
  expect(screen.getAllByText("Vez do Magnus (brancas).")).toHaveLength(1);
  view.rerender(<Board {...normal} contextContainer={host} modo="demonstration" exibicao={{ fen: A1.fen, de: "b1", para: "c3" }} />);
  expect(host.textContent).toContain("DEMONSTRAÇÃO");
  expect(host.textContent).toContain("Demonstração: a sua partida está guardada.");
  expect(host.textContent).not.toContain("Explore uma posição");
  expect(normal.onLance).not.toHaveBeenCalled();
  view.unmount();
  host.remove();
});
