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
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByTestId("official-fen");
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "gameReplay").mockImplementation(async () => {
    const current = game();
    return { game_id: current.id, version: current.version, initial_fen: current.initial_fen,
      current_fen: current.current_fen, steps: [], result: "*", termination: "playing" };
  });
  vi.spyOn(api, "listGames").mockResolvedValue({ games: [], next_offset: null });
  vi.spyOn(api, "agents").mockResolvedValue([
    { id: "balanced", display_name: "Equilibrado", difficulty: "intermediate", style: "balanced", description: "Melhor avaliação" },
    { id: "aggressive", display_name: "Agressivo", difficulty: "intermediate", style: "aggressive", description: "Atividade" },
  ]);
});
it("cria de brancas e aplica somente o estado oficial humano + IA", async () => {
  await start(); expect(api.createGame).toHaveBeenCalledWith("white", "balanced", expect.any(String));
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
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" }));
  await screen.findByTestId("official-fen");
  expect(api.createGame).toHaveBeenCalledWith("black", "balanced", expect.any(String)); expect(board.options?.boardOrientation).toBe("black");
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

it("mostra perfis, envia escolha e mantém identidade da Game ao mudar próxima seleção", async () => {
  await start(game([], { opponent: { type: "ai", agent_id: "aggressive" } }));
  expect(screen.getByRole("option", { name: "Agressivo" })).toBeTruthy();
  expect(screen.getByText(/Adversário da partida: Agressivo/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Adversário"), { target: { value: "aggressive" } });
  fireEvent.click(screen.getByText("Nova partida contra IA"));
  await waitFor(() => expect(api.createGame).toHaveBeenLastCalledWith("white", "aggressive", expect.any(String)));
  fireEvent.change(screen.getByLabelText("Adversário"), { target: { value: "balanced" } });
  expect(screen.getByText(/Adversário da partida: Agressivo/)).toBeTruthy();
});
it("catálogo malformado não quebra tela e permite recarregar", async () => {
  vi.mocked(api.agents).mockResolvedValueOnce([null, { id: "bad", difficulty: "impossible" }] as never);
  render(<AiGame onPosition={vi.fn()} />);
  expect((await screen.findByRole("alert")).textContent).toContain("carregar os adversários");
  expect((screen.getByText("Iniciar partida contra IA") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("Recarregar adversários"));
  await screen.findByRole("option", { name: "Equilibrado" });
  await waitFor(() => expect((screen.getByText("Iniciar partida contra IA") as HTMLButtonElement).disabled).toBe(false));
});
it("perfil retornado desconhecido é exibido sem substituir identidade", async () => {
  await start(game([], { opponent: { type: "ai", agent_id: "future_profile" } }));
  expect(screen.getByText(/Adversário da partida: future_profile/)).toBeTruthy();
});

function summary(next = game()): import("../types").GameSummary {
  return { ...next, profile: null, move_count: next.moves.length };
}
it("remount lista e retoma mesma Game oficial, preserva perfil e continua", async () => {
  const created = game([], { opponent: { type: "ai", agent_id: "positional", profile_version: 1 } });
  vi.spyOn(api, "createGame").mockResolvedValue(created);
  const send = vi.spyOn(api, "submitHumanMove").mockResolvedValue(game(["e2e4", "e7e5"], { opponent: created.opponent }));
  const first = render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByText("Iniciar partida contra IA") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Iniciar partida contra IA")); await screen.findByTestId("official-fen");
  drop("e2", "e4"); await waitFor(() => expect(board.options?.position).toBe(game(["e2e4", "e7e5"]).current_fen));
  first.unmount();
  const saved = game(["e2e4", "e7e5"], { opponent: created.opponent });
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary(saved)], next_offset: null });
  vi.spyOn(api, "getGame").mockResolvedValue(saved);
  render(<AiGame onPosition={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Adversário"), { target: { value: "aggressive" } });
  fireEvent.click(await screen.findByRole("button", { name: /Continuar partida/ }));
  await screen.findByTestId("official-fen");
  expect(board.options?.position).toBe(saved.current_fen);
  expect(screen.getByText(/Adversário da partida: positional/)).toBeTruthy();
  expect(api.createGame).toHaveBeenCalledTimes(1);
  send.mockResolvedValue(game(["e2e4", "e7e5", "g1f3", "b8c6"], { opponent: created.opponent }));
  drop("g1", "f3");
  await waitFor(() => expect(board.options?.position).toBe(game(["e2e4", "e7e5", "g1f3", "b8c6"]).current_fen));
});
it("lista vazia e referência local inválida não criam partida", async () => {
  localStorage.setItem("xadrez:game_id", "not-owned");
  const create = vi.spyOn(api, "createGame"); const get = vi.spyOn(api, "getGame");
  render(<AiGame onPosition={vi.fn()} />); await screen.findByText("Nenhuma partida encontrada.");
  expect(create).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled(); localStorage.removeItem("xadrez:game_id");
});
it("retomada pendente bloqueia humano e usa retry existente", async () => {
  const pending = game(["e2e4"], { human_color: "white" });
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary(pending)], next_offset: null });
  vi.spyOn(api, "getGame").mockResolvedValue(pending);
  const retry = vi.spyOn(api, "resumeAgent").mockResolvedValue(game(["e2e4", "e7e5"]));
  render(<AiGame onPosition={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: /Continuar partida/ }));
  await screen.findByTestId("official-fen"); expect(board.options?.allowDragging).toBe(false);
  fireEvent.click(screen.getByText("Tentar novamente o turno da IA"));
  await waitFor(() => expect(retry).toHaveBeenCalledWith("one", 1));
  await waitFor(() => expect(board.options?.allowDragging).toBe(true));
});
it("retoma terminal sem jogar, perfil e orientação vêm do servidor", async () => {
  const terminal = game([], { status: "checkmate", winner: "white", terminal: true, human_color: "black" });
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary(terminal)], next_offset: null });
  vi.spyOn(api, "getGame").mockResolvedValue(terminal); const retry = vi.spyOn(api, "resumeAgent");
  render(<AiGame onPosition={vi.fn()} />); fireEvent.click(await screen.findByRole("button", { name: /Revisar partida/ }));
  await screen.findByTestId("official-fen"); expect(board.options?.allowDragging).toBe(false);
  expect(board.options?.boardOrientation).toBe("black"); expect(retry).not.toHaveBeenCalled();
  expect(screen.getByText("Nova partida contra IA")).toBeTruthy();
});
it("erro de listagem e ID desaparecido são recuperáveis", async () => {
  vi.mocked(api.listGames).mockRejectedValueOnce(new Error("offline"));
  render(<AiGame onPosition={vi.fn()} />); await screen.findByText(/Não foi possível listar/);
  vi.mocked(api.listGames).mockResolvedValue({ games: [summary()], next_offset: null });
  fireEvent.click(screen.getByText("Atualizar partidas"));
  vi.spyOn(api,"getGame").mockRejectedValue(new (await import("../api")).ErroDePartida({ code:"game_not_found",message:"Partida não encontrada." },404));
  fireEvent.click(await screen.findByRole("button",{name:/Continuar partida/}));
  await screen.findByText("Partida não encontrada."); expect(screen.queryByTestId("official-fen")).toBeNull();
});
it("double click cria uma intenção e falha de transporte reutiliza chave/payload", async () => {
  let reject!: (e: Error) => void;
  const create = vi.spyOn(api,"createGame").mockImplementationOnce(() => new Promise((_,r) => { reject=r; })).mockResolvedValue(game());
  render(<AiGame onPosition={vi.fn()} />);
  await waitFor(() => expect((screen.getByText("Iniciar partida contra IA") as HTMLButtonElement).disabled).toBe(false));
  const button = screen.getByText("Iniciar partida contra IA"); fireEvent.click(button); fireEvent.click(button);
  expect(create).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("transport")));
  fireEvent.click(screen.getByText("Confirmar criação da partida"));
  await screen.findByTestId("official-fen"); expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
});

it("SAN abre replay bloqueado; somente retorno explícito permite continuar", async () => {
  const current = game(["e2e4", "e7e5"]);
  const chess = new Chess();
  vi.mocked(api.gameReplay).mockResolvedValue({game_id:current.id,version:2,initial_fen:current.initial_fen,current_fen:current.current_fen,result:"*",termination:"playing",steps:current.moves.map((uci,i)=> {
    const move=chess.move(uci); return {ply:i+1,move_number:1,color:i===0?"white":"black",uci,san:move.san,fen:chess.fen()};
  })});
  const position=vi.fn();
  vi.spyOn(api,"createGame").mockResolvedValue(current);
  const send=vi.spyOn(api,"submitHumanMove").mockResolvedValue(game(["e2e4","e7e5","g1f3","b8c6"]));
  render(<AiGame onPosition={position} />);
  await waitFor(()=>expect((screen.getByText("Iniciar partida contra IA") as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByText("Iniciar partida contra IA"));
  fireEvent.click(await screen.findByRole("button",{name:"1. e4"}));
  expect(board.options?.allowDragging).toBe(false);
  expect(position).toHaveBeenLastCalledWith(current.current_fen);
  drop("g1","f3"); expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Fim do histórico")); expect(board.options?.allowDragging).toBe(false);
  fireEvent.click(screen.getByText("Voltar à posição atual")); expect(board.options?.allowDragging).toBe(true);
  drop("g1","f3");await waitFor(()=>expect(send).toHaveBeenCalledTimes(1));
});

const inspiredProfiles = [
 {id:"magnus_inspired",display_name:"Perfil inspirado em Magnus",difficulty:"advanced",style:"positional",description:"Perfil educacional inspirado: interpretação heurística, sem imitação fiel.",inspiration:"Magnus",profile_version:1,persona:{id:"structure",version:1,tone:"analítico",focus:"estrutura"}},
 {id:"hans_inspired",display_name:"Perfil inspirado em Hans",difficulty:"advanced",style:"aggressive",description:"Perfil educacional inspirado: interpretação heurística, sem imitação fiel.",inspiration:"Hans",profile_version:1,persona:{id:"initiative",version:1,tone:"direto",focus:"iniciativa"}},
 {id:"judit_inspired",display_name:"Perfil inspirado em Judit",difficulty:"advanced",style:"tactical",description:"Perfil educacional inspirado: interpretação heurística, sem imitação fiel.",inspiration:"Judit",profile_version:1,persona:{id:"threats",version:1,tone:"energético",focus:"ameaças"}},
] as import("../types").AgentProfile[];
it.each(inspiredProfiles)("escolhe $id mantendo grupos, perfil persistido e replay",async(profile)=>{
 const generic=[{id:"training_beginner",display_name:"Treino inicial",difficulty:"beginner",style:"balanced",description:"Treino"},{id:"balanced",display_name:"Equilibrado",difficulty:"intermediate",style:"balanced",description:"Equilíbrio"},{id:"aggressive",display_name:"Agressivo",difficulty:"intermediate",style:"aggressive",description:"Atividade"},{id:"positional",display_name:"Posicional",difficulty:"advanced",style:"positional",description:"Estrutura"},{id:"tactical",display_name:"Tático",difficulty:"advanced",style:"tactical",description:"Tática"}] as import("../types").AgentProfile[];
 vi.mocked(api.agents).mockResolvedValue([...generic,...inspiredProfiles]);
 const official=game([], {profile,opponent:{type:"ai",agent_id:profile.id,profile_version:1}});
 vi.spyOn(api,"createGame").mockResolvedValue(official);
 render(<AiGame onPosition={vi.fn()}/>);
 await screen.findByRole("option",{name:profile.display_name});
 expect(screen.getByRole("group",{name:"Perfis de treino"})).toBeTruthy();expect(screen.getByRole("group",{name:"Perfis inspirados"})).toBeTruthy();
 for(const p of generic)expect(screen.getByRole("option",{name:p.display_name})).toBeTruthy();
 fireEvent.change(screen.getByLabelText("Adversário"),{target:{value:profile.id}});
 expect(screen.getByText(/Perfil educacional inspirado/)).toBeTruthy();
 fireEvent.click(screen.getByText("Iniciar partida contra IA"));await screen.findByTestId("official-fen");
 expect(api.createGame).toHaveBeenCalledWith("white",profile.id,expect.any(String));
 fireEvent.change(screen.getByLabelText("Adversário"),{target:{value:"balanced"}});
 expect(screen.getByText(new RegExp("Adversário da partida: "+profile.display_name))).toBeTruthy();
 fireEvent.click(await screen.findByText("Fim do histórico"));expect(board.options?.allowDragging).toBe(false);
 expect(screen.getByText(new RegExp("Adversário da partida: "+profile.display_name))).toBeTruthy();
});
it("remount retoma identidade/persona inspirada oficial sem nova criação",async()=>{
 const profile=inspiredProfiles[2];const saved=game(["e2e4","e7e5"],{profile,opponent:{type:"ai",agent_id:profile.id,profile_version:1}});
 vi.mocked(api.agents).mockResolvedValue(inspiredProfiles);vi.mocked(api.listGames).mockResolvedValue({games:[summary(saved)],next_offset:null});
 const get=vi.spyOn(api,"getGame").mockResolvedValue(saved);const create=vi.spyOn(api,"createGame");
 const first=render(<AiGame onPosition={vi.fn()}/>);fireEvent.click(await screen.findByRole("button",{name:/Continuar partida/}));await screen.findByTestId("official-fen");first.unmount();
 render(<AiGame onPosition={vi.fn()}/>);fireEvent.click(await screen.findByRole("button",{name:/Continuar partida/}));await screen.findByTestId("official-fen");
 expect(get).toHaveBeenCalledTimes(2);expect(create).not.toHaveBeenCalled();expect(screen.getByText(/Persona v1 \(energético\)/)).toBeTruthy();expect(board.options?.position).toBe(saved.current_fen);
});
it.each([["win",16,"Vitória"],["loss",-16,"Derrota"],["draw",0,"Empate"]] as const)("Game terminal mostra %s e variação persistida",async(result,delta,label)=>{
 await start(game([], {terminal:true,status:result==='draw'?'stalemate':'checkmate',rating_change:{before:1200,after:1200+delta,delta,result,opponent_rating:1200,rating_system_version:1}}));
 const text=await screen.findByLabelText("Variação de rating");expect(text.textContent).toContain(label);expect(text.textContent).toContain(String(1200+delta));expect(text.textContent).toContain(delta>0?'+16':String(delta));
 expect(screen.queryByText("Atualizar pontuação desta partida")).toBeNull();
});
