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
  for (const hash of ["#/historico", "#/masters", "#/licoes", "#/pratica", "#/sobre"]) {
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

function summary(current: Game) { return { ...current, profile: current.profile ?? null, move_count: current.moves.length }; }
function replay(current: Game) {
  const chess = new Chess(current.initial_fen);
  const steps = current.moves.map((uci, index) => {
    const move = chess.move(uci);
    return { ply: index + 1, move_number: Math.floor(index / 2) + 1, color: move.color === "w" ? "white" as const : "black" as const, uci, san: move.san, fen: chess.fen() };
  });
  return { game_id: current.id, version: current.version, initial_fen: current.initial_fen, current_fen: current.current_fen, steps, result: current.terminal ? "1-0" : "*", termination: current.status };
}
it("Histórico carrega a Game escolhida antes de navegar, sem criar outra", async () => {
  const selected = { ...game(["e2e4"], "black"), id: "chosen", opponent: { type: "ai" as const, agent_id: "balanced" } };
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary(selected)], next_offset: null });
  let resolve!: (game: Game) => void;
  const get = vi.spyOn(api, "getGame").mockReturnValue(new Promise<Game>(yes => { resolve = yes; }));
  const create = vi.spyOn(api, "createGame"); const agent = vi.spyOn(api, "resumeAgent");
  vi.mocked(api.gameReplay).mockResolvedValue(replay(selected));
  mount("#/historico");
  fireEvent.click(await screen.findByRole("button", { name: /^Continuar partida/ }));
  expect(window.location.hash).toBe("#/historico"); expect(screen.getByText("Abrindo partida…")).toBeTruthy();
  expect(get).toHaveBeenCalledWith(selected.id);
  await act(async () => resolve(selected));
  await waitFor(() => expect(window.location.hash).toBe("#/partida"));
  expect(official().getByTestId("official-position").getAttribute("data-fen")).toBe(selected.current_fen);
  expect(options().boardOrientation).toBe("black"); expect(options().canDragPiece({ square: "d2" })).toBe(false);
  expect(options().canDragPiece({ square: "e7" })).toBe(true);
  expect(create).not.toHaveBeenCalled(); expect(agent).not.toHaveBeenCalled();
});
it("Rever Game ativa abre replay somente leitura e preserva-o ao navegar", async () => {
  const selected = game(["e2e4", "e7e5"]);
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary(selected)], next_offset: null });
  vi.spyOn(api, "getGame").mockResolvedValue(selected); vi.mocked(api.gameReplay).mockResolvedValue(replay(selected));
  const create = vi.spyOn(api, "createGame"); const send = vi.spyOn(api, "submitHumanMove"); const rating = vi.spyOn(api, "reconcileRating");
  mount("#/historico"); fireEvent.click(await screen.findByRole("button", { name: /^Rever partida/ }));
  await waitFor(() => expect(window.location.hash).toBe("#/partida"));
  await screen.findByRole("button", { name: "Voltar à posição atual" });
  expect(options().allowDragging).toBe(false);
  await act(async () => options().onPieceDrop({ sourceSquare: "d2", targetSquare: "d4" }));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Início do histórico" }));
  expect(official().getByTestId("official-position").getAttribute("data-fen")).toBe(selected.initial_fen);
  await navigate("#/historico"); await navigate("#/partida");
  expect(official().getByTestId("official-position").getAttribute("data-fen")).toBe(selected.initial_fen);
  expect(options().allowDragging).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Voltar à posição atual" }));
  expect(official().getByTestId("official-position").getAttribute("data-fen")).toBe(selected.current_fen);
  expect(options().allowDragging).toBe(true);
  expect(create).not.toHaveBeenCalled(); expect(rating).not.toHaveBeenCalled();
});
it("Rever finalizada bloqueia movimentos sem reconciliar rating ou criar Game", async () => {
  const selected = { ...game(["e2e4", "e7e5"]), terminal: true, status: "checkmate" as const, winner: "white" as const };
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary(selected)], next_offset: null });
  vi.spyOn(api, "getGame").mockResolvedValue(selected); vi.mocked(api.gameReplay).mockResolvedValue(replay(selected));
  const create = vi.spyOn(api, "createGame"); const rating = vi.spyOn(api, "reconcileRating"); const send = vi.spyOn(api, "submitHumanMove"); const review = vi.spyOn(api, "reviewGame");
  mount("#/historico"); fireEvent.click(await screen.findByRole("button", { name: /^Rever partida/ }));
  await waitFor(() => expect(window.location.hash).toBe("#/partida"));
  await screen.findByRole("button", { name: "Voltar à posição atual" });
  expect(options().allowDragging).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Voltar à posição atual" }));
  expect(options().allowDragging).toBe(false);
  await act(async () => options().onPieceDrop({ sourceSquare: "d2", targetSquare: "d4" }));
  for (const operation of [create, rating, send, review]) expect(operation).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Exportar PGN" })).toBeTruthy();
});
it("falha ao abrir outra Game mantém a anterior e permanece no Histórico", async () => {
  const current = game(); vi.spyOn(api, "createGame").mockResolvedValue(current);
  const { container } = mount();
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" })); await official().findByTestId("official-position");
  const element = container.querySelector(".official-match [data-testid]");
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary({ ...current, id: "missing" })], next_offset: null });
  vi.spyOn(api, "getGame").mockRejectedValue(new Error("404"));
  await navigate("#/historico"); fireEvent.click(await screen.findByRole("button", { name: /^Continuar partida/ }));
  await screen.findByRole("alert"); expect(window.location.hash).toBe("#/historico");
  await navigate("#/partida"); expect(official().getByTestId("official-position")).toBe(element);
  expect(element?.getAttribute("data-fen")).toBe(current.current_fen); expect(api.createGame).toHaveBeenCalledTimes(1);
});
it("Nova partida no arquivo apenas navega, mantendo a Game carregada", async () => {
  vi.spyOn(api, "createGame").mockResolvedValue(game()); mount();
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" })); await official().findByTestId("official-position");
  const current = official().getByTestId("official-position"); await navigate("#/historico");
  fireEvent.click(screen.getByRole("link", { name: "Nova partida" }));
  await waitFor(() => expect(window.location.hash).toBe("#/partida"));
  expect(official().getByTestId("official-position")).toBe(current); expect(api.createGame).toHaveBeenCalledTimes(1);
});
