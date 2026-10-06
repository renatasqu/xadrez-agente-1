import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Chess } from "chess.js";
import { beforeEach, expect, it, vi } from "vitest";
import { AiGame } from "./AiGame";
import { api } from "../api";
import type { Game } from "../types";

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { position: string } }) => <div data-testid="official-fen">{String(options.position)}</div>,
}));

function game(moves: string[] = [], patch: Partial<Game> = {}): Game {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  return {
    id: "one",
    initial_fen: new Chess().fen(),
    current_fen: chess.fen(),
    moves,
    human_color: "white",
    side_to_move: chess.turn() === "w" ? "white" : "black",
    status: "playing",
    winner: null,
    terminal: false,
    awaiting_agent: chess.turn() === "b",
    opponent: { type: "ai", agent_id: "balanced" },
    created_at: "now",
    updated_at: "now",
    version: moves.length,
    ...patch,
  };
}

async function start(next = game()) {
  vi.spyOn(api, "createGame").mockResolvedValue(next);
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByTestId("official-fen");
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "listGames").mockResolvedValue({ games: [], next_offset: null });
  vi.spyOn(api, "agents").mockResolvedValue([
    { id: "balanced", display_name: "Equilibrado", difficulty: "intermediate", style: "balanced", description: "Melhor avaliação" },
    { id: "aggressive", display_name: "Agressivo", difficulty: "intermediate", style: "aggressive", description: "Atividade" },
  ]);
});

it("mostra apenas a configuração antes de iniciar a partida", async () => {
  render(<AiGame onPosition={vi.fn()} />);
  expect(screen.getByLabelText("Seu lado")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Iniciar partida contra IA" })).toBeTruthy();
});

it("esconde o setup assim que a partida ativa existe", async () => {
  await start();
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
  expect(screen.getByText(/Partida atual:/)).toBeTruthy();
});

it("mantém a visão terminal sem expor o setup", async () => {
  await start(game([], { status: "checkmate", winner: "white", terminal: true }));
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.getAllByText(/Xeque-mate/).length).toBeGreaterThan(0);
});

it("mantém a visão ativa sem reabrir o setup", async () => {
  await start();
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.getAllByText(/Turno das brancas\./).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
});
