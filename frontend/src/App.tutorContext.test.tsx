import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Chess } from "chess.js";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api, ErroDaApi } from "./api";
import type { Game, Resposta } from "./types";
import { textoPedagogico } from "./idioma";
import { CENARIOS } from "./testes/pedagogia";
import { A1 } from "./testes/exercises";

vi.mock("react-chessboard", () => ({ Chessboard: ({ options }: { options: any }) =>
  <div data-testid="tutor-board" data-fen={options.position} ref={node => { if (node) (node as any).options = options; }} />,
}));
function game(moves = ["e2e4", "e7e5", "g1f3", "b8c6"], color: Game["human_color"] = "white", id = "context-game"): Game {
  const chess = new Chess(); moves.forEach(move => chess.move(move));
  return { id, initial_fen: new Chess().fen(), current_fen: chess.fen(), moves, human_color: color,
    side_to_move: chess.turn() === "w" ? "white" : "black", status: "playing", winner: null,
    terminal: false, awaiting_agent: false, opponent: { type: "ai", agent_id: "balanced", profile_version: 1 },
    created_at: "now", updated_at: "now", version: moves.length };
}
const response: Resposta = { resposta: "e2e4 e4 Nf3", fontes: [], agente: "professor", confianca: 0 };
let current: Game;
let chat: ReturnType<typeof vi.spyOn>;
function options() { return (document.querySelector(".official-match [data-testid]") as any).options; }
async function navigate(hash: string) {
  await act(async () => { window.history.replaceState(null, "", hash); window.dispatchEvent(new Event("hashchange")); });
}
function mount(hash = "#/partida") { window.history.replaceState(null, "", hash); return render(<App />); }
async function start(next = game()) {
  current = next;
  vi.mocked(api.createGame).mockResolvedValue(next);
  mount();
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByText("Histórico e revisão");
  await waitFor(() => expect(screen.queryByText("Carregando histórico…")).toBeNull());
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Conversar sobre esta posição" }));
  await screen.findByRole("dialog", { name: "SEU TUTOR" });
}
async function send() {
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "Explique" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar" })); });
}
function close() { fireEvent.keyDown(screen.getByRole("dialog", { name: "SEU TUTOR" }), { key: "Escape" }); }
function expected(context: unknown) { expect(chat).toHaveBeenLastCalledWith("Explique", undefined, context); }

beforeEach(() => {
  vi.restoreAllMocks(); current = game();
  vi.spyOn(api, "saude").mockResolvedValue({ status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" });
  vi.spyOn(api, "licaoAtual").mockRejectedValue(new ErroDaApi("Sem lição", 404));
  vi.spyOn(api, "listGames").mockResolvedValue({ games: [], next_offset: null });
  vi.spyOn(api, "agents").mockResolvedValue([{ id: "balanced", display_name: "Equilibrado", description: "Perfil", difficulty: "intermediate", style: "balanced" }]);
  vi.spyOn(api, "createGame").mockResolvedValue(current);
  vi.spyOn(api, "getGame").mockImplementation(async () => current);
  vi.spyOn(api, "submitHumanMove").mockImplementation(async () => current);
  vi.spyOn(api, "resumeAgent").mockResolvedValue(current);
  vi.spyOn(api, "gameReplay").mockImplementation(async id => {
    const board = new Chess(current.initial_fen);
    return { game_id: id, version: current.version, initial_fen: current.initial_fen, current_fen: current.current_fen,
      result: "*", termination: "playing", steps: current.moves.map((uci, i) => {
        const move = board.move(uci);
        return { ply: i + 1, move_number: Math.floor(i / 2) + 1, color: i % 2 ? "black" : "white", uci, san: move.san, fen: board.fen() };
      }) };
  });
  chat = vi.spyOn(api, "perguntar").mockResolvedValue(response);
});
afterEach(() => { vi.restoreAllMocks(); });

it("Game contextual envia apenas identificadores automaticamente e texto SAN/UCI não move", async () => {
  await start(); const before = options().position;
  await open(); expect(screen.getByLabelText("Contexto do Tutor").textContent).toBe("Posição atual da partida");
  await send(); expected({ source: "game", game_id: current.id });
  expect(screen.getByText("e2e4 e4 Nf3")).toBeTruthy(); close();
  expect(options().position).toBe(before);
  expect(api.submitHumanMove).not.toHaveBeenCalled(); expect(api.resumeAgent).not.toHaveBeenCalled();
  expect(current.human_color).toBe("white"); expect(current.version).toBe(4);
});

it("replay acompanha ply 0/intermediário/final e volta ao presente sem permitir lances", async () => {
  await start();
  for (const [button, ply] of [["Início do histórico", 0], ["Próximo lance", 1], ["Fim do histórico", 4]] as const) {
    fireEvent.click(screen.getByRole("button", { name: button }));
    await open(); expect(screen.getByLabelText("Contexto do Tutor").textContent).toBe(`Revisão · ply ${ply}`);
    await send(); expected({ source: "replay", game_id: current.id, ply }); close();
    expect(options().allowDragging).toBe(false);
    act(() => { options().onPieceDrop?.({ sourceSquare: "e2", targetSquare: "e4", piece: { pieceType: "wP", position: "e2" } }); });
  }
  expect(api.submitHumanMove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Voltar à posição atual" }));
  await open(); expect(screen.getAllByText(/Conversa anterior ·/).length).toBeGreaterThan(0);
  await send(); expected({ source: "game", game_id: current.id }); close();
  expect(options().position).toBe(current.current_fen);
});

it("erro 503 não altera Game nem apresenta conversa de outro contexto", async () => {
  await start(); const before = JSON.stringify(current);
  chat.mockRejectedValueOnce(new ErroDaApi("Tutor sem provedor", 503));
  await open(); await send(); expect(await screen.findByText("Tutor sem provedor")).toBeTruthy(); close();
  fireEvent.click(screen.getByRole("button", { name: "Lance anterior" }));
  await open(); expect(screen.getAllByText(/Conversa anterior ·/).length).toBeGreaterThan(0);
  expect(JSON.stringify(current)).toBe(before);
});

it.each(["white", "black"] as const)("%s: abertura/resposta automática e Tutor preservam Game e lado humano", async color => {
  const initial = game(color === "black" ? ["e2e4"] : [], color);
  await start(initial);
  const next = game(color === "black" ? ["e2e4", "e7e5", "g1f3"] : ["e2e4", "e7e5"], color);
  vi.mocked(api.submitHumanMove).mockResolvedValue(next); current = next;
  const source = color === "black" ? "e7" : "e2", target = color === "black" ? "e5" : "e4";
  act(() => { options().onPieceDrop({ sourceSquare: source, targetSquare: target, piece: { pieceType: color === "black" ? "bP" : "wP", position: source } }); });
  await waitFor(() => expect(options().position).toBe(next.current_fen));
  expect(api.submitHumanMove).toHaveBeenCalledTimes(1); expect(options().boardOrientation).toBe(color);
  await open(); await send(); close();
  expect(api.submitHumanMove).toHaveBeenCalledTimes(1); expect(api.resumeAgent).not.toHaveBeenCalled();
  expect(options().position).toBe(next.current_fen); expect(next.human_color).toBe(color);
});

it("navegar para exploração usa FEN exibido e não Game anterior", async () => {
  await start(); await open(); await send(); close();
  await navigate("#/pratica");
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  expect(screen.getByLabelText("Contexto do Tutor").textContent).toBe("Posição de estudo");
  expect(screen.getAllByText(/Conversa anterior ·/).length).toBeGreaterThan(0); await send();
  expected({ source: "exploration", fen: new Chess().fen() });
});

it("resposta pendente da Game mantém rótulo de origem após navegar para exploração", async () => {
  let resolve!: (value: Resposta) => void;
  chat.mockImplementationOnce(() => new Promise<Resposta>(done => { resolve = done; }));
  await start(); await open();
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "Explique" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" })); close();
  await navigate("#/pratica");
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  await act(async () => resolve(response));
  expect(screen.getAllByText(/Conversa anterior ·/).length).toBeGreaterThan(0); await send();
  expected({ source: "exploration", fen: new Chess().fen() });
});

it("continuar outra Game troca ID e identifica conversa anterior", async () => {
  await start(); await open(); await send(); close();
  current = game(["d2d4", "d7d5"], "black", "another-game");
  vi.mocked(api.listGames).mockResolvedValue({ games: [{ ...current, profile: current.profile ?? null, move_count: 2 }], next_offset: null });
  await navigate("#/historico");
  fireEvent.click(await screen.findByRole("button", { name: /^Continuar partida contra/ }));
  await screen.findByRole("button", { name: "Conversar sobre esta posição" });
  await open(); await send(); expected({ source: "game", game_id: "another-game" });
  expect(screen.getAllByText(/Conversa anterior · Posição atual da partida/).length).toBeGreaterThan(0);
});

it("exercício envia seu FEN sem Game e trocar exercício atualiza contexto sem progresso", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A1);
  const progress = vi.spyOn(api, "progressoExercicios").mockResolvedValue([]);
  const validate = vi.spyOn(api, "validarExercicio").mockRejectedValue(new Error("Não deve ser chamado"));
  chat.mockResolvedValue({ ...response, related_exercise_ids: [A1.id] });
  mount("#/pratica");
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ })); await send();
  fireEvent.click(await screen.findByRole("button", { name: /Praticar este conceito/ }));
  await screen.findByText(A1.prompt);
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  expect(screen.getByLabelText("Contexto do Tutor").textContent).toBe("Exercício");
  const reads = progress.mock.calls.length;
  await send(); expected({ source: "exercise", fen: A1.fen });
  expect(validate).not.toHaveBeenCalled(); expect(progress.mock.calls.length).toBe(reads);
  expect(api.createGame).not.toHaveBeenCalled(); expect(api.submitHumanMove).not.toHaveBeenCalled();
  const next = { ...A1, id: "second-exercise", fen: "4k3/8/8/8/8/8/8/2N1K3 w - - 0 1" };
  vi.mocked(api.exercicio).mockResolvedValue(next);
  fireEvent.click(screen.getAllByRole("button", { name: /Praticar este conceito/ })[0]);
  await waitFor(() => expect((document.querySelector('#partida [data-testid="tutor-board"]') as HTMLElement).dataset.fen).toBe(next.fen));
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ })); await send();
  expected({ source: "exercise", fen: next.fen });
  expect(validate).not.toHaveBeenCalled();
});

it("exploração envia a posição histórica exibida em vez da posição final", async () => {
  mount("#/pratica");
  const manual = () => (document.querySelector('#partida [data-testid="tutor-board"]') as any).options;
  for (const [source, target, piece] of [["e2", "e4", "wP"], ["e7", "e5", "bP"]]) {
    act(() => { manual().onPieceDrop({ sourceSquare: source, targetSquare: target, piece: { pieceType: piece, position: source } }); });
  }
  const finalFen = manual().position;
  fireEvent.click(screen.getByRole("button", { name: /Ver posição após e4, jogada 1/ }));
  const historicalFen = manual().position; expect(historicalFen).not.toBe(finalFen);
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ })); await send();
  expected({ source: "exploration", fen: historicalFen });
});

it("Lições apresenta currículo real, progresso entregue e ajuda visível sem posição falsa", async () => {
  const lesson = { usuario_id: "f63e63f2-4ed6-494d-bf86-2fa2f95110fd", concluido: false,
    licao: { numero: 2, total: 12, titulo: "O roque", modulo: "regras" }, conteudo: response };
  vi.mocked(api.licaoAtual).mockResolvedValue(lesson);
  const advance = vi.spyOn(api, "proximaLicao").mockResolvedValue({ ...lesson, licao: { ...lesson.licao, numero: 3, titulo: "En passant" } });
  mount("#/licoes");
  await screen.findByText("Lições entregues: 2/12");
  fireEvent.click(screen.getByText("Ver as 12 lições do percurso"));
  expect(screen.getByRole("list", { name: "Lista de lições" }).querySelectorAll("li")).toHaveLength(12);
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("2");
  expect(screen.getByText("Como funciona o roque?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Abrir conversa do tutor" }));
  expect((screen.getByLabelText("Sua pergunta") as HTMLTextAreaElement).value).toBe("Explique a lição “O roque”.");
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  await waitFor(() => expect(chat).toHaveBeenLastCalledWith("Explique a lição “O roque”.", undefined, undefined));
  close(); fireEvent.click(screen.getByRole("button", { name: "Próxima lição" }));
  await screen.findByText("Lições entregues: 3/12"); expect(advance).toHaveBeenCalledTimes(1);
  expect(api.createGame).not.toHaveBeenCalled();
});

it("escolhas de prática e CTA preservam Game e rating e retorno mantém o mesmo ID", async () => {
  vi.spyOn(api, "exercicio").mockResolvedValue(A1);
  vi.spyOn(api, "progressoExercicios").mockResolvedValue([]);
  const rating = vi.spyOn(api, "reconcileRating");
  await start(game(["e2e4"], "black")); const before = options().position;
  await navigate("#/pratica");
  expect(screen.getByText(/Suas ações aqui não alteram/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Movimento do cavalo" }));
  await screen.findByText(A1.prompt);
  fireEvent.click(screen.getByRole("button", { name: "Pedir ajuda ao Tutor" }));
  await send(); expected({ source: "exercise", fen: A1.fen }); close();
  fireEvent.click(screen.getByRole("button", { name: "Jogar contra IA" }));
  await screen.findByRole("button", { name: "Conversar sobre esta posição" });
  expect(options().position).toBe(before); expect(options().boardOrientation).toBe("black");
  await open(); await send(); expected({ source: "game", game_id: current.id }); close();
  expect(api.createGame).toHaveBeenCalledTimes(1);
  expect(api.submitHumanMove).not.toHaveBeenCalled(); expect(api.resumeAgent).not.toHaveBeenCalled(); expect(rating).not.toHaveBeenCalled();
});


it("Tutor acompanha a posição visível na refutação e volta ao exercício sem game_id", async () => {
  const fixture = CENARIOS.e1;
  vi.spyOn(api, "exercicio").mockResolvedValue(fixture.exercise);
  vi.spyOn(api, "progressoExercicios").mockResolvedValue([]);
  vi.spyOn(api, "validarExercicio").mockResolvedValue(fixture.results.incorrect);
  mount("#/pratica");
  fireEvent.click(screen.getByRole("button", { name: "Segurança material" }));
  await screen.findByText(textoPedagogico(fixture.exercise.prompt));
  const manual = () => (document.querySelector('#partida [data-testid="tutor-board"]') as any).options;
  act(() => manual().onPieceDrop({ sourceSquare: "e1", targetSquare: "f2", piece: { pieceType: "wK", position: "e1" } }));
  await screen.findByText("Tente novamente.");
  fireEvent.click(screen.getByRole("button", { name: "Ver sequência de refutação" }));
  fireEvent.click(screen.getByRole("button", { name: "Próximo na refutação" }));
  const preview = manual().position;
  expect(preview).not.toBe(fixture.exercise.fen);
  fireEvent.click(screen.getByRole("button", { name: "Pedir ajuda ao Tutor" }));
  await send(); expected({ source: "exercise", fen: preview }); close();
  fireEvent.click(screen.getByRole("button", { name: "Voltar ao exercício" }));
  fireEvent.click(screen.getByRole("button", { name: "Pedir ajuda ao Tutor" }));
  await send(); expected({ source: "exercise", fen: manual().position }); close();
  expect(api.createGame).not.toHaveBeenCalled(); expect(api.submitHumanMove).not.toHaveBeenCalled();
});

it("concluir o percurso mantém o conteúdo e o progresso da última lição", async () => {
  const last = { usuario_id: "f63e63f2-4ed6-494d-bf86-2fa2f95110fd", concluido: false,
    licao: { numero: 12, total: 12, titulo: "A oposição", modulo: "finais" }, conteudo: response };
  vi.mocked(api.licaoAtual).mockResolvedValue(last);
  vi.spyOn(api, "proximaLicao").mockResolvedValue({ usuario_id: last.usuario_id, concluido: true, licao: null, conteudo: null });
  mount("#/licoes"); await screen.findByText("Lições entregues: 12/12");
  fireEvent.click(screen.getByRole("button", { name: "Próxima lição" }));
  await screen.findByText("Você concluiu todas as lições!");
  expect(screen.getByRole("progressbar").getAttribute("value")).toBe("12");
  expect(screen.getByLabelText("Conteúdo da lição").textContent).toContain("A oposição");
});

it("Masters prepara o setup sem criar Game, permite escolher lado e respeita identidade oficial", async () => {
  const generic = { id: "balanced", display_name: "Equilibrado", description: "Treino", difficulty: "intermediate", style: "balanced", profile_version: 1 } as const;
  const inspired = { id: "magnus_inspired", display_name: "Perfil inspirado em Magnus", description: "Interpretação educacional", difficulty: "advanced", style: "positional", inspiration: "Magnus", profile_version: 1 } as const;
  vi.mocked(api.agents).mockResolvedValue([generic, inspired]);
  vi.spyOn(api, "mastersRatings").mockResolvedValue({ masters: [], updated_at: null, stale: true, source: "FIDE" });
  const rating = vi.spyOn(api, "reconcileRating");
  current = { ...game(["e2e4"], "black"), opponent: { type: "ai", agent_id: inspired.id, profile_version: 1 }, profile: inspired };
  vi.mocked(api.createGame).mockResolvedValue(current);
  mount("#/masters");
  fireEvent.click(await screen.findByRole("button", { name: "Jogar contra este perfil: Perfil inspirado em Magnus" }));
  await waitFor(() => expect((screen.getByLabelText("Adversário") as HTMLSelectElement).value).toBe(inspired.id));
  expect(window.location.hash).toBe("#/partida"); expect(api.createGame).not.toHaveBeenCalled(); expect(rating).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /PRETAS/ }));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByRole("button", { name: "Conversar sobre esta posição" });
  expect(api.createGame).toHaveBeenCalledWith("black", inspired.id, expect.any(String));
  const before = options().position;
  await navigate("#/masters");
  fireEvent.click(await screen.findByRole("button", { name: "Jogar contra este perfil: Equilibrado" }));
  await screen.findByText(/Sua partida atual foi preservada/);
  expect(screen.getByRole("heading", { name: inspired.display_name })).toBeTruthy();
  expect(options().position).toBe(before); expect(options().boardOrientation).toBe("black");
  expect(current.opponent.profile_version).toBe(1); expect(api.createGame).toHaveBeenCalledTimes(1);
  expect(api.submitHumanMove).not.toHaveBeenCalled(); expect(rating).not.toHaveBeenCalled();
  await navigate("#/historico");
  vi.mocked(api.listGames).mockResolvedValue({ games: [{ ...current, profile: current.profile ?? null, move_count: 1 }], next_offset: null });
  await navigate("#/partida"); await navigate("#/historico");
  fireEvent.click(await screen.findByRole("button", { name: /^Rever partida contra Perfil inspirado em Magnus/ }));
  await screen.findByRole("button", { name: "Conversar sobre esta posição" });
  expect(screen.getByRole("heading", { name: inspired.display_name })).toBeTruthy();
  expect(api.createGame).toHaveBeenCalledTimes(1); expect(current.opponent.profile_version).toBe(1);
});
