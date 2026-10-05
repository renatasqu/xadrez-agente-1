import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { AiGame } from "./AiGame";
import { api } from "../api";
import type { Game } from "../types";
import type { ChessboardOptions } from "react-chessboard";
const board = vi.hoisted(() => ({ options: null as ChessboardOptions | null }));
vi.mock("react-chessboard", () => ({ Chessboard: ({ options }: { options: ChessboardOptions }) => {
  board.options = options; return <div data-testid="official-fen">{String(options.position)}</div>;
} }));
function game(moves: string[] = [], patch: Partial<Game> = {}): Game {
  const chess = new Chess(); for (const m of moves) chess.move(m);
  return { id: "one", initial_fen: new Chess().fen(), current_fen: chess.fen(), moves,
    human_color: "white", side_to_move: chess.turn() === "w" ? "white" : "black", status: "playing", winner: null,
    terminal: false, awaiting_agent: chess.turn() === "b", opponent: { type: "ai", agent_id: "stockfish" },
    created_at: "now", updated_at: "now", version: moves.length, ...patch };
}
function drop(source: string, target: string) {
  act(() => { board.options?.onPieceDrop?.({ sourceSquare: source, targetSquare: target,
    piece: { pieceType: "wP", position: source, isSparePiece: false } }); });
}
async function start(next = game()) {
  vi.spyOn(api, "createGame").mockResolvedValue(next);
  render(<AiGame onPosition={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByTestId("official-fen");
}
beforeEach(() => vi.restoreAllMocks());
it("cria de brancas e aplica somente o estado oficial humano + IA", async () => {
  await start(); expect(api.createGame).toHaveBeenCalledWith("white");
  let resolve!: (g: Game) => void;
  const send = vi.spyOn(api, "submitHumanMove").mockImplementation(() => new Promise(r => { resolve = r; }));
  drop("e2", "e4"); drop("d2", "d4");
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toMatchObject({ move: "e2e4", version: 0 });
  expect(send.mock.calls[0][1].client_move_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(board.options?.allowDragging).toBe(false);
  expect(board.options?.position).toBe(game().current_fen);
  await act(async () => resolve(game(["e2e4", "e7e5"])));
  expect(board.options?.position).toBe(game(["e2e4", "e7e5"]).current_fen);
  expect(board.options?.allowDragging).toBe(true);
});
it("pretas recebem primeiro lance e podem responder, com nova resposta da IA", async () => {
  vi.spyOn(api, "createGame").mockResolvedValue(game(["e2e4"], { human_color: "black", awaiting_agent: false }));
  const send = vi.spyOn(api, "submitHumanMove").mockResolvedValue(game(["e2e4", "e7e5", "g1f3"], { human_color: "black", awaiting_agent: false }));
  render(<AiGame onPosition={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Seu lado"), { target: { value: "black" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByTestId("official-fen");
  expect(api.createGame).toHaveBeenCalledWith("black"); expect(board.options?.boardOrientation).toBe("black");
  drop("e7", "e5"); await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(board.options?.position).toBe(game(["e2e4", "e7e5", "g1f3"]).current_fen));
});
it("preserva lance humano após falha e retoma turno sem recriar partida", async () => {
  await start();
  vi.spyOn(api, "submitHumanMove").mockResolvedValue(game(["e2e4"], { human_move: "e2e4", agent_status: "error", error: "agent_unavailable" }));
  const retry = vi.spyOn(api, "resumeAgent").mockResolvedValue(game(["e2e4", "e7e5"], { agent_status: "moved" }));
  drop("e2", "e4");
  expect((await screen.findByRole("alert")).textContent).toContain("Seu lance foi preservado");
  expect(board.options?.allowDragging).toBe(false);
  fireEvent.click(screen.getByText("Tentar novamente o turno da IA"));
  await waitFor(() => expect(retry).toHaveBeenCalledWith("one", 1));
  await waitFor(() => expect(board.options?.allowDragging).toBe(true));
  expect(api.createGame).toHaveBeenCalledTimes(1);
});
it.each([["Dama", "q"], ["Torre", "r"], ["Bispo", "b"], ["Cavalo", "n"]])("promoção humana %s envia UCI explícito", async (label, suffix) => {
  const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
  await start(game([], { initial_fen: fen, current_fen: fen }));
  const send = vi.spyOn(api, "submitHumanMove").mockResolvedValue(game());
  drop("a7", "a8"); fireEvent.click(screen.getByRole("button", { name: label }));
  expect(send.mock.calls[0][1].move).toBe("a7a8"+suffix);
  await waitFor(() => expect(board.options?.allowDragging).toBe(true));
});
it.each(["check", "checkmate", "repetition"] as const)("mostra estado oficial %s", async status => {
  await start(game([], { status, terminal: status !== "check", winner: status === "checkmate" ? "black" : null }));
  expect(screen.getAllByText(status === "check" ? "Xeque!" : status === "checkmate" ? "Xeque-mate. Pretas venceram." : "Empate por repetição tripla.").length).toBeGreaterThan(0);
  expect(board.options?.allowDragging).toBe(status === "check");
});
it("nova partida cria novo recurso", async () => {
  await start(); fireEvent.click(screen.getByText("Nova partida contra IA"));
  await waitFor(() => expect(api.createGame).toHaveBeenCalledTimes(2));
});
