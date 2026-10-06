import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { GameList, GameSummary } from "../types";
import { HistoryOverview } from "./HistoryOverview";

const saved = (patch: Partial<GameSummary> = {}): GameSummary => ({
  id: "private-uuid-not-a-label", human_color: "white", opponent: { type: "ai", agent_id: "balanced", profile_version: 1 },
  profile: { id: "balanced", display_name: "Equilibrado", difficulty: "intermediate", style: "balanced", description: "Perfil" },
  created_at: "2026-10-06T12:00:00Z", updated_at: "2026-10-06T12:10:00Z", status: "playing", winner: null,
  terminal: false, side_to_move: "white", awaiting_agent: false, move_count: 2, version: 2, ...patch,
});
const list = (games: GameSummary[], next_offset: number | null = null): GameList => ({ games, next_offset });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function mount(onOpen = vi.fn(async () => {})) { render(<HistoryOverview onOpen={onOpen} />); return onOpen; }
beforeEach(() => { vi.spyOn(api, "listGames").mockResolvedValue(list([saved()])); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("arquivo tem título, subtítulo, resumo da página e nenhuma criação de Game", async () => {
  const create = vi.spyOn(api, "createGame"); const get = vi.spyOn(api, "getGame"); const review = vi.spyOn(api, "reviewGame");
  mount(); await screen.findByText("Equilibrado");
  expect(screen.getByRole("heading", { name: "Histórico" })).toBeTruthy();
  expect(screen.getByText("Suas partidas contra os agentes.")).toBeTruthy();
  expect(screen.getByLabelText("Resumo da página").textContent).toContain("1 partida · 1 em andamento · 0 finalizadas");
  expect(screen.queryByLabelText("Adversário")).toBeNull(); expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.queryByRole("button", { name: "Iniciar partida contra IA" })).toBeNull();
  for (const request of [create, get, review]) expect(request).not.toHaveBeenCalled();
});
it.each([["all", "Todas"], ["active", "Em andamento"], ["finished", "Finalizadas"]])("filtro %s usa a API existente com offset zero", async (filter, label) => {
  mount(); await screen.findByText("Equilibrado");
  fireEvent.change(screen.getByRole("combobox", { name: "Filtrar partidas" }), { target: { value: filter } });
  await waitFor(() => expect(api.listGames).toHaveBeenLastCalledWith(filter, 0));
  expect((screen.getByRole("combobox") as HTMLSelectElement).selectedOptions[0].textContent).toBe(label);
});
it.each([["all", "Nenhuma partida ainda"], ["active", "Nenhuma partida em andamento."], ["finished", "Nenhuma partida finalizada ainda."]])("empty state %s corresponde ao filtro", async (filter, title) => {
  vi.mocked(api.listGames).mockResolvedValue(list([])); mount();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: filter } });
  await screen.findByRole("heading", { name: title });
  if (filter === "all") {
    expect(screen.getByText("Jogue sua primeira partida contra um agente para começar seu histórico.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Jogar agora" }).getAttribute("href")).toBe("#/partida");
  }
});
it("loading discreto não mostra um empty state prematuro", async () => {
  const request = deferred<GameList>(); vi.mocked(api.listGames).mockReturnValue(request.promise); mount();
  expect(screen.getByRole("status").textContent).toBe("Carregando partidas…");
  expect(screen.queryByText("Nenhuma partida ainda")).toBeNull();
  await act(async () => request.resolve(list([saved()]))); await screen.findByText("Equilibrado");
});
it("erro inicial oferece retry e recupera a lista", async () => {
  vi.mocked(api.listGames).mockRejectedValueOnce(new Error("offline")); mount();
  await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByText("Equilibrado"); expect(screen.queryByRole("alert")).toBeNull();
});
it("erro ao atualizar preserva a lista válida", async () => {
  mount(); await screen.findByText("Equilibrado"); vi.mocked(api.listGames).mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar partidas" })); await screen.findByRole("alert");
  expect(screen.getByText("Equilibrado")).toBeTruthy(); expect(screen.getByText(/Exibindo a última lista carregada: Todas/)).toBeTruthy();
});
it("erro de outro filtro identifica a lista anterior e retry mantém o filtro pedido", async () => {
  mount(); await screen.findByText("Equilibrado"); vi.mocked(api.listGames).mockRejectedValueOnce(new Error("offline"));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "finished" } }); await screen.findByRole("alert");
  expect(screen.getByText(/última lista carregada: Todas/)).toBeTruthy();
  vi.mocked(api.listGames).mockResolvedValue(list([])); fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await screen.findByText("Nenhuma partida finalizada ainda."); expect(api.listGames).toHaveBeenLastCalledWith("finished", 0);
});
it("resposta antiga de filtro não substitui a resposta mais recente", async () => {
  const old = deferred<GameList>(); const next = deferred<GameList>();
  vi.mocked(api.listGames).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise); mount();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "finished" } });
  await act(async () => next.resolve(list([saved({ terminal: true, status: "checkmate", winner: "white" })])));
  await screen.findByText("Vitória"); await act(async () => old.resolve(list([])));
  expect(screen.getByText("Vitória")).toBeTruthy(); expect(screen.queryByText("Nenhuma partida ainda")).toBeNull();
});
it("Continuar e Rever são ações explícitas, sem Game completa por item", async () => {
  const onOpen = mount(); await screen.findByText("Equilibrado");
  fireEvent.click(screen.getByRole("button", { name: /^Continuar partida/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(saved().id, false));
  fireEvent.click(screen.getByRole("button", { name: /^Rever partida/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(saved().id, true));
});
it("finalizada oferece Rever e não Continuar", async () => {
  vi.mocked(api.listGames).mockResolvedValue(list([saved({ terminal: true, status: "checkmate", winner: "white" })]));
  const onOpen = mount(); await screen.findByText("Vitória");
  expect(screen.queryByRole("button", { name: /^Continuar/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Rever/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith(saved().id, true));
});
it.each([
  [{ terminal: true, status: "checkmate", winner: "white", human_color: "white" }, "Vitória"],
  [{ terminal: true, status: "checkmate", winner: "white", human_color: "black" }, "Derrota"],
  [{ terminal: true, status: "stalemate", winner: null }, "Empate"],
  [{ terminal: true, status: "checkmate", winner: null }, "Resultado não informado"],
] as const)("resultado oficial %j produz %s", async (patch, expected) => {
  vi.mocked(api.listGames).mockResolvedValue(list([saved(patch)])); mount(); await screen.findByText(expected);
  if (expected === "Resultado não informado") expect(screen.queryByText("Empate")).toBeNull();
});
it("dados legíveis não expõem UUID, FEN, versão ou nome interno", async () => {
  mount(); const card = await screen.findByRole("listitem");
  expect(card.textContent).toContain("Brancas"); expect(card.textContent).toContain("2 lances"); expect(card.querySelector("time")?.getAttribute("datetime")).toBe(saved().updated_at);
  expect(card.textContent).not.toContain(saved().id); expect(card.innerHTML).not.toContain("private-uuid"); expect(card.textContent).not.toContain("balanced"); expect(card.textContent).not.toContain("Perfil v1");
});
it("perfil e data ausentes não viram informação inventada", async () => {
  vi.mocked(api.listGames).mockResolvedValue(list([saved({ profile: null, updated_at: "invalid" })])); mount();
  await screen.findByText("Perfil não informado"); expect(screen.getByText("Data não disponível")).toBeTruthy(); expect(screen.queryByText("Invalid Date")).toBeNull();
});
it("paginação substitui a página, mantém filtro e remove duplicatas sem reordenar", async () => {
  const first = saved({ id: "first" }); const second = saved({ id: "second", profile: { ...saved().profile!, display_name: "Tático" } });
  vi.mocked(api.listGames).mockImplementation(async (_filter, offset) => offset === 20 ? list([second, second]) : list([first], 20));
  mount(); await screen.findByText("Equilibrado"); fireEvent.change(screen.getByRole("combobox"), { target: { value: "active" } });
  await waitFor(() => expect(api.listGames).toHaveBeenLastCalledWith("active", 0));
  fireEvent.click(screen.getByRole("button", { name: "Próxima" })); await screen.findByText("Tático");
  expect(screen.getAllByRole("listitem")).toHaveLength(1); expect(screen.queryByText("Equilibrado")).toBeNull(); expect(api.listGames).toHaveBeenLastCalledWith("active", 20);
  expect((screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Anterior" })); await screen.findByText("Equilibrado"); expect(api.listGames).toHaveBeenLastCalledWith("active", 0);
});
it("trocar filtro depois de paginar volta à primeira página", async () => {
  vi.mocked(api.listGames).mockResolvedValue(list([saved()], 20)); mount(); await screen.findByText("Equilibrado");
  fireEvent.click(screen.getByRole("button", { name: "Próxima" })); await waitFor(() => expect(api.listGames).toHaveBeenLastCalledWith("all", 20));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "finished" } }); await waitFor(() => expect(api.listGames).toHaveBeenLastCalledWith("finished", 0));
});
it("abertura falha mantém arquivo e permite tentar novamente", async () => {
  const onOpen = vi.fn().mockRejectedValueOnce(new Error("404")).mockResolvedValue(undefined); mount(onOpen); await screen.findByText("Equilibrado");
  fireEvent.click(screen.getByRole("button", { name: /^Continuar/ })); await screen.findByRole("alert");
  expect(screen.getByText("Equilibrado")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: /^Continuar/ }));
  await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
it("duplo clique não abre duas Games", async () => {
  const pending = deferred<void>(); const onOpen = vi.fn(() => pending.promise); mount(onOpen); await screen.findByText("Equilibrado");
  const button = screen.getByRole("button", { name: /^Continuar/ }); fireEvent.click(button); fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledTimes(1); await act(async () => pending.resolve());
});
it("ações são botões visíveis sem depender de hover e Nova partida é só um link", async () => {
  const create = vi.spyOn(api, "createGame"); mount(); await screen.findByText("Equilibrado");
  expect(screen.getByRole("button", { name: /^Continuar/ }).closest("details")).toBeNull();
  expect(screen.getByRole("button", { name: /^Rever/ }).closest("details")).toBeNull();
  expect(screen.getByRole("link", { name: "Nova partida" }).getAttribute("href")).toBe("#/partida"); expect(create).not.toHaveBeenCalled();
});
it("usa listagem autenticada, sem mesclar partidas de outra sessão ou armazenamento local", async () => {
  vi.restoreAllMocks(); const owned = saved(); const other = saved({ id: "other-user", profile: { ...owned.profile!, display_name: "Adversário de outra conta" } });
  const fetcher = vi.fn(async (_url: unknown, options?: RequestInit) => new Response(JSON.stringify(list(options?.credentials === "include" ? [owned] : [other])), { status: 200 }));
  vi.stubGlobal("fetch", fetcher); localStorage.setItem("irrelevant-games", JSON.stringify([other])); mount();
  await screen.findByText("Equilibrado"); expect(screen.queryByText("Adversário de outra conta")).toBeNull(); expect(fetcher.mock.calls[0][1]?.credentials).toBe("include"); localStorage.removeItem("irrelevant-games");
});
it("401 preserva o evento global de sessão expirada", async () => {
  vi.restoreAllMocks(); const expired = vi.fn(); window.addEventListener("xadrez:session-expired", expired);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "unauthenticated", message: "Entre novamente" }), { status: 401 })));
  try { mount(); await screen.findByRole("alert"); expect(expired).toHaveBeenCalledTimes(1); }
  finally { window.removeEventListener("xadrez:session-expired", expired); }
});
