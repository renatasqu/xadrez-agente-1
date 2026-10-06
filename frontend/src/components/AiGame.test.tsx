import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Chess } from "chess.js";
import { beforeEach, expect, it, vi } from "vitest";
import { AiGame } from "./AiGame";
import { api } from "../api";
import type { Game } from "../types";

const board = vi.hoisted(() => ({ options: null as { position?: string; boardOrientation?: "white" | "black"; allowDragging?: boolean; onPieceDrop?: (payload: any) => boolean; onSquareClick?: (payload: any) => void } | null }));

vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { position: string; boardOrientation?: "white" | "black"; allowDragging?: boolean; onPieceDrop?: (payload: any) => boolean; onSquareClick?: (payload: any) => void } }) => {
    board.options = options;
    return <div data-testid="official-fen">{String(options.position)}</div>;
  },
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

function drop(source: string, target: string) {
  act(() => {
    board.options?.onPieceDrop?.({ sourceSquare: source, targetSquare: target, piece: { pieceType: "wP", position: source, isSparePiece: false } });
  });
}

async function start(next = game()) {
  vi.spyOn(api, "createGame").mockResolvedValue(next);
  if (!screen.queryByLabelText("Seu lado")) {
    render(<AiGame onPosition={vi.fn()} />);
  }
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByTestId("official-fen");
}

beforeEach(() => {
  vi.restoreAllMocks();
  board.options = null;
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

it("permite trocar o perfil antes de iniciar e usar a seleção atual ao criar a partida", async () => {
  const create = vi.spyOn(api, "createGame").mockResolvedValue(game());
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByLabelText("Adversário") as HTMLSelectElement).value).toBe("balanced"));
  fireEvent.change(screen.getByLabelText("Adversário"), { target: { value: "aggressive" } });
  await waitFor(() => expect((screen.getByLabelText("Adversário") as HTMLSelectElement).value).toBe("aggressive"));
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await waitFor(() => expect(screen.queryByLabelText("Seu lado")).toBeNull());
  expect(create).toHaveBeenCalledWith("white", "aggressive", expect.any(String));
});

it("mostra o alerta do catálogo e oferece recarga de perfis", async () => {
  vi.mocked(api.agents).mockRejectedValueOnce(new Error("offline"));
  render(<AiGame onPosition={vi.fn()} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Recarregar adversários" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar partida contra IA" })).toBeTruthy());
});

it("lista vazia não cria partida nem tenta continuar uma sessão inexistente", async () => {
  const create = vi.spyOn(api, "createGame");
  render(<AiGame onPosition={vi.fn()} />);
  expect(await screen.findByText("Nenhuma partida encontrada.")).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

it("retoma uma partida ativa da lista sem reabrir o setup", async () => {
  const saved = game(["e2e4", "e7e5"], { id: "saved-game", status: "playing", awaiting_agent: false, human_color: "white", side_to_move: "black" });
  vi.mocked(api.listGames).mockResolvedValue({ games: [{ id: saved.id, human_color: saved.human_color, opponent: saved.opponent, profile: null, created_at: saved.created_at, updated_at: saved.updated_at, status: saved.status, winner: null, terminal: false, side_to_move: saved.side_to_move, awaiting_agent: false, move_count: saved.moves.length, version: saved.version }], next_offset: null });
  const get = vi.spyOn(api, "getGame").mockResolvedValue(saved);
  render(<AiGame onPosition={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Continuar partida/ }));
  await screen.findByText(/Partida atual:/);
  expect(get).toHaveBeenCalledWith("saved-game");
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
});

it("retoma uma partida terminal sem jogar e mantém a visão final", async () => {
  const terminal = game([], { id: "terminal-game", status: "checkmate", winner: "white", terminal: true, human_color: "black" });
  vi.mocked(api.listGames).mockResolvedValue({ games: [{ id: terminal.id, human_color: terminal.human_color, opponent: terminal.opponent, profile: null, created_at: terminal.created_at, updated_at: terminal.updated_at, status: terminal.status, winner: terminal.winner, terminal: true, side_to_move: "white", awaiting_agent: false, move_count: 0, version: terminal.version }], next_offset: null });
  vi.spyOn(api, "getGame").mockResolvedValue(terminal);
  render(<AiGame onPosition={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Revisar partida/ }));
  await screen.findByText(/Partida atual:/);
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.getAllByText(/Xeque-mate/).length).toBeGreaterThan(0);
});

it("bloqueia drag quando a IA está pendente e mostra o retry do turno da IA", async () => {
  const current = game([], { awaiting_agent: true, status: "playing" });
  vi.spyOn(api, "createGame").mockResolvedValue(current);
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull());
  expect(screen.getAllByText(/É o turno da IA/).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /Tentar novamente o turno da IA/i })).toBeTruthy();
  expect(board.options?.allowDragging).toBe(false);
});

it("preserva o lance humano e exibe a recuperação da IA quando o turno falha", async () => {
  await start();
  vi.spyOn(api, "submitHumanMove").mockResolvedValue(game(["e2e4"], { human_move: "e2e4", agent_status: "error", error: "agent_unavailable" }));
  const retry = vi.spyOn(api, "resumeAgent").mockResolvedValue(game(["e2e4", "e7e5"], { agent_status: "moved" }));
  drop("e2", "e4");
  const alerta = await screen.findByRole("alert");
  expect(alerta.textContent).toMatch(/Seu lance foi preservado/i);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente o turno da IA" }));
  await waitFor(() => expect(retry).toHaveBeenCalledWith("one", 1));
  await waitFor(() => expect(board.options?.allowDragging).toBe(true));
});

it("cria a partida com a cor preta e usa a orientação correta do tabuleiro", async () => {
  vi.spyOn(api, "createGame").mockResolvedValue(game([], { human_color: "black", side_to_move: "white" }));
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByLabelText("Seu lado") as HTMLSelectElement).value).toBe("white"));
  fireEvent.change(screen.getByLabelText("Seu lado"), { target: { value: "black" } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await waitFor(() => expect(screen.queryByLabelText("Seu lado")).toBeNull());
  expect(api.createGame).toHaveBeenCalledWith("black", "balanced", expect.any(String));
  expect(board.options?.boardOrientation).toBe("black");
});

it("envia o lance humano com UUID e versão correta", async () => {
  await start();
  const send = vi.spyOn(api, "submitHumanMove").mockResolvedValue(game(["e2e4"]));
  drop("e2", "e4");
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toMatchObject({ move: "e2e4", version: 0 });
  expect(send.mock.calls[0][1].client_move_id).toMatch(/^[0-9a-f-]{36}$/);
});

it("promove o peão com UCI explícito ao escolher a peça da promoção", async () => {
  const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
  await start(game([], { initial_fen: fen, current_fen: fen }));
  const send = vi.spyOn(api, "submitHumanMove").mockResolvedValue(game());
  drop("a7", "a8");
  fireEvent.click(screen.getByRole("button", { name: "Dama" }));
  expect(send.mock.calls[0][1].move).toBe("a7a8q");
});

it("exibe status final em português para xeque", async () => {
  await start(game([], { status: "check", terminal: false, awaiting_agent: false }));
  expect(screen.getAllByText("Xeque!").length).toBeGreaterThan(0);
});

it("exibe status final em português para empate por repetição", async () => {
  await start(game([], { status: "repetition", terminal: true, winner: null }));
  expect(screen.getAllByText(/Empate por repetição tripla/).length).toBeGreaterThan(0);
});

it("permite navegar no replay e voltar para a posição atual", async () => {
  const current = game(["e2e4", "e7e5"]);
  vi.spyOn(api, "gameReplay").mockResolvedValue({
    game_id: current.id,
    version: current.version,
    initial_fen: current.initial_fen,
    current_fen: current.current_fen,
    steps: [
      { ply: 1, move_number: 1, color: "white", uci: "e2e4", san: "e4", fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" },
      { ply: 2, move_number: 1, color: "black", uci: "e7e5", san: "e5", fen: current.current_fen },
    ],
    result: "*",
    termination: "playing",
  });
  vi.spyOn(api, "createGame").mockResolvedValue(current);
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull());
  expect(screen.getAllByText(/Partida atual:|Histórico|Replay/).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /Exportar PGN|Revisão|Histórico/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Partida atual:|Histórico|Replay/).length).toBeGreaterThan(0);
});

it("mantém o perfil oficial do servidor após remount e não recria a partida", async () => {
  const saved = game(["e2e4"], { id: "resume-game", opponent: { type: "ai", agent_id: "aggressive", profile_version: 1 } });
  vi.mocked(api.listGames).mockResolvedValue({ games: [{ id: saved.id, human_color: saved.human_color, opponent: saved.opponent, profile: null, created_at: saved.created_at, updated_at: saved.updated_at, status: saved.status, winner: saved.winner, terminal: saved.terminal, side_to_move: saved.side_to_move, awaiting_agent: saved.awaiting_agent, move_count: saved.moves.length, version: saved.version }], next_offset: null });
  vi.spyOn(api, "getGame").mockResolvedValue(saved);
  render(<AiGame onPosition={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Continuar partida/ }));
  await waitFor(() => expect(screen.getByText(/Adversário da partida: Agressivo|Adversário da partida: aggressive/)).toBeTruthy());
  expect(screen.getByText(/Perfil v1|Perfil v\d+/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
});

it("mostra a variação de rating no fim da partida sem ocultar o estado final", async () => {
  await start(game([], {
    status: "checkmate",
    winner: "white",
    terminal: true,
    rating_change: { before: 1200, after: 1216, delta: 16, result: "win", opponent_rating: 1200, rating_system_version: 1 },
  }));
  expect(screen.getByText(/Rating nesta partida: 1216/)).toBeTruthy();
  expect(screen.getByText(/Vitória/)).toBeTruthy();
});

it("lista estados oficiais em português sem misturar palavras em inglês", async () => {
  vi.mocked(api.listGames).mockResolvedValue({
    games: [{ id: "status-game", human_color: "white", opponent: { type: "ai", agent_id: "balanced" }, profile: null, created_at: "now", updated_at: "now", status: "check", winner: null, terminal: false, side_to_move: "black", awaiting_agent: false, move_count: 1, version: 1 }],
    next_offset: null,
  });
  render(<AiGame onPosition={vi.fn()} />);
  expect(await screen.findByText(/Xeque/)).toBeTruthy();
  expect(screen.queryByText(/· check ·/)).toBeNull();
});

it("mantém a partida em andamento e o layout de Game ativa sem reexibir o setup", async () => {
  const current = game(["e2e4", "e7e5"], { awaiting_agent: false, human_color: "white", side_to_move: "white" });
  vi.spyOn(api, "createGame").mockResolvedValue(current);
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull());
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.getAllByText(/Partida atual:|Histórico e revisão|Histórico/).length).toBeGreaterThan(0);
});

it("mantém a visão ativa sem reabrir o setup e sem expor o formulário de criação", async () => {
  await start();
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
  expect(screen.getByText(/Partida atual:/)).toBeTruthy();
});

it("retoma uma partida pretendida de um perfil inspirador sem perder identidade", async () => {
  const inspired = { id: "magnus_inspired", display_name: "Perfil inspirado em Magnus", difficulty: "advanced", style: "positional", description: "perfil educacional inspirado", inspiration: "Magnus" } as const;
  vi.mocked(api.agents).mockResolvedValue([
    { ...inspired },
    { id: "balanced", display_name: "Equilibrado", difficulty: "intermediate", style: "balanced", description: "Melhor avaliação" },
  ]);
  const current = game([], { opponent: { type: "ai", agent_id: inspired.id, profile_version: 1 } });
  vi.spyOn(api, "createGame").mockResolvedValue(current);
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByLabelText("Adversário") as HTMLSelectElement).value).toBe("balanced"));
  fireEvent.change(screen.getByLabelText("Adversário"), { target: { value: inspired.id } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull());
  expect(screen.getByText(/Adversário da partida: Perfil inspirado em Magnus|Adversário da partida: magnus_inspired/)).toBeTruthy();
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
});

it("mantém o histórico carregado e a análise disponível sem desmontar a arena ativa", async () => {
  vi.spyOn(api, "gameReplay").mockResolvedValue({
    game_id: "one",
    version: 0,
    initial_fen: new Chess().fen(),
    current_fen: new Chess().fen(),
    steps: [],
    result: "*",
    termination: "playing",
  });
  await start();
  expect(screen.getByText(/Histórico e revisão/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Exportar PGN" })).toBeTruthy();
});

it("permite reabrir o setup somente quando não há Game ativa", async () => {
  await start();
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
});

it("mantém o guardrail de renderização: sem Game mostra setup; com Game ativa não monta setup", async () => {
  render(<AiGame onPosition={vi.fn()} />);
  expect(screen.getByLabelText("Seu lado")).toBeTruthy();
  await start();
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.getAllByText(/Partida atual:/).length).toBeGreaterThan(0);
});

it("não expõe nomes de adversários em inglês quando o perfil oficial é português", async () => {
  const current = game([], { opponent: { type: "ai", agent_id: "balanced" } });
  vi.spyOn(api, "createGame").mockResolvedValue(current);
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull());
  expect(screen.getByText(/Adversário da partida: Equilibrado|Adversário da partida: balanced/)).toBeTruthy();
  expect(screen.queryByText(/Adversário da partida: Balanced/)).toBeNull();
});
