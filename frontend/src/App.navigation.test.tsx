import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Chess } from "chess.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api } from "./api";
import type { Game } from "./types";

const board = vi.hoisted(() => ({ options: null as any }));
vi.mock("react-chessboard", () => ({ Chessboard: ({ options }: { options: any }) => {
  board.options = options;
  return <div data-testid="official-position" data-fen={options.position} ref={node => { if (node) (node as any).options = options; }} />;
} }));
function official() { return within(screen.getByRole("region", { name: "Partida contra IA" })); }
function options() { return (document.querySelector(".official-match [data-testid]") as any).options; }
function game(moves: string[] = [], human_color: Game["human_color"] = "white"): Game {
  const chess = new Chess(); moves.forEach(move => chess.move(move));
  return { id: "preserved-game", initial_fen: new Chess().fen(), current_fen: chess.fen(), moves,
    human_color, side_to_move: chess.turn() === "w" ? "white" : "black", status: "playing", winner: null,
    terminal: false, awaiting_agent: false, opponent: { type: "ai", agent_id: "balanced" },
    created_at: "now", updated_at: "now", version: moves.length };
}
async function navigate(hash: string) {
  await act(async () => { window.history.replaceState(null, "", hash); window.dispatchEvent(new Event("hashchange")); });
}
function mount(hash = "#/partida") {
  window.history.replaceState(null, "", hash);
  return render(<App />);
}
beforeEach(() => {
  vi.restoreAllMocks(); board.options = null;
  vi.spyOn(api, "saude").mockResolvedValue({ status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" });
  vi.spyOn(api, "listGames").mockResolvedValue({ games: [], next_offset: null });
  vi.spyOn(api, "agents").mockResolvedValue([{ id: "balanced", display_name: "Equilibrado", description: "Perfil", difficulty: "intermediate", style: "balanced" }]);
  vi.spyOn(api, "mastersRatings").mockResolvedValue({ updated_at: null, masters: [], stale: true, source: "FIDE" });
  vi.spyOn(api, "gameReplay").mockImplementation(async id => ({ game_id: id, version: 0,
    initial_fen: new Chess().fen(), current_fen: new Chess().fen(), steps: [], result: "*", termination: "playing" }));
});
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

it.each([["#/partida", "Partida"], ["#/historico", "Histórico"], ["#/masters", "Masters"], ["#/licoes", "Lições"], ["#/sobre", "Sobre"]])("indica somente %s como destino ativo", (hash, name) => {
  const { container } = mount(hash);
  const nav = within(container.querySelector("nav[aria-label='Navegação principal']")! as HTMLElement);
  expect(nav.getByRole("link", { name }).getAttribute("aria-current")).toBe("location");
  expect(container.querySelectorAll("nav[aria-label='Navegação principal'] [aria-current]")).toHaveLength(1);
  expect(window.location.hash).toBe(hash);
});
it.each(["#partida", "#/partida", "#desconhecido"])("%s abre a Partida oficial, sem tabuleiro manual", hash => {
  const { container } = mount(hash);
  expect(window.location.hash).toBe("#/partida");
  expect(screen.getByRole("button", { name: "Iniciar partida contra IA" })).toBeTruthy();
  expect(container.querySelector("main#partida")?.hasAttribute("hidden")).toBe(true);
});
it.each(["#historico-partida", "#/historico-partida"])("%s abre Histórico, sem setup visível", hash => {
  mount(hash);
  expect(window.location.hash).toBe("#/historico");
  expect(screen.getByRole("region", { name: "Histórico de partidas" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
});
it.each(["#explorar", "#agentes"])("%s identifica a prática separadamente da Partida", hash => {
  const { container } = mount(hash);
  expect(window.location.hash).toBe("#/pratica");
  expect(container.querySelector("main#partida")?.hasAttribute("hidden")).toBe(false);
  expect(screen.getByRole("link", { name: "Partida" }).hasAttribute("aria-current")).toBe(false);
});
it.each(["#/historico", "#/masters", "#/licoes", "#/partida"])("fechar Sobre retorna a %s", async hash => {
  mount(hash); await navigate("#/sobre");
  expect(screen.getByRole("dialog", { name: "SOBRE O PROJETO:" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar sobre o projeto" }));
  await waitFor(() => expect(window.location.hash).toBe(hash));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("Sobre direto retorna à Partida por Escape", async () => {
  mount("#/sobre"); fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(window.location.hash).toBe("#/partida"));
  await screen.findByRole("button", { name: "Iniciar partida contra IA" });
});
it("sair de Sobre pelo hash fecha o modal sem cobrir o próximo destino", async () => {
  mount("#/sobre"); await navigate("#/licoes");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: "Lições de xadrez" })).toBeTruthy();
});
it("navegar preserva Game, posição, cor e replay sem operações de escrita", async () => {
  const create = vi.spyOn(api, "createGame").mockResolvedValue(game());
  const submit = vi.spyOn(api, "submitHumanMove").mockResolvedValue(game(["e2e4", "e7e5"]));
  const resume = vi.spyOn(api, "resumeAgent"); const rating = vi.spyOn(api, "reconcileRating");
  const get = vi.spyOn(api, "getGame"); const review = vi.spyOn(api, "reviewGame");
  const { container } = mount();
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  const element = await official().findByTestId("official-position");
  expect(options().canDragPiece({ square: "e7" })).toBe(false);
  expect(options().canDragPiece({ square: "e2" })).toBe(true);
  const position = element.getAttribute("data-fen");
  for (const hash of ["#/historico", "#/masters", "#/licoes", "#/sobre"]) {
    await navigate(hash);
    expect(screen.queryByRole("region", { name: "Partida contra IA" })).toBeNull();
    if (hash === "#/sobre") {
      fireEvent.click(screen.getByRole("button", { name: "Fechar sobre o projeto" }));
      await waitFor(() => expect(window.location.hash).toBe("#/partida"));
    }
    fireEvent.click(screen.getByRole("link", { name: "XADREZ MULTIAGENTE" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Partida contra IA" })).toBeTruthy());
    expect(window.location.hash).toBe("#/partida");
    expect(official().getByTestId("official-position")).toBe(element);
    expect(element.getAttribute("data-fen")).toBe(position);
    expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
    expect(container.querySelector("main#partida")?.hasAttribute("hidden")).toBe(true);
  }
  expect(create).toHaveBeenCalledTimes(1);
  for (const operation of [submit, resume, rating, get, review]) expect(operation).not.toHaveBeenCalled();
  await act(async () => { options().onPieceDrop({ sourceSquare: "e2", targetSquare: "e4", piece: { pieceType: "wP" } }); });
  await waitFor(() => expect(element.getAttribute("data-fen")).toBe(game(["e2e4", "e7e5"]).current_fen));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(resume).not.toHaveBeenCalled();
});
it("pretas mantém abertura automática recebida do backend após navegar", async () => {
  vi.spyOn(api, "createGame").mockResolvedValue(game(["e2e4"], "black"));
  mount();
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText("Seu lado"), { target: { value: "black" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await official().findByTestId("official-position");
  await navigate("#/masters"); await navigate("#/partida");
  expect(official().getByTestId("official-position").getAttribute("data-fen")).toBe(game(["e2e4"], "black").current_fen);
  expect(options().boardOrientation).toBe("black");
  expect(options().canDragPiece({ square: "d2" })).toBe(false);
  expect(options().canDragPiece({ square: "e7" })).toBe(true);
  expect(api.createGame).toHaveBeenCalledTimes(1);
});
