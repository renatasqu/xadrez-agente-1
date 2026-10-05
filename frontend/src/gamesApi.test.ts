import { afterEach, expect, it, vi } from "vitest";
import { api, ErroDePartida } from "./api";

afterEach(() => vi.unstubAllGlobals());
function responder(status = 200, body: unknown = { id: "game", moves: [] }) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}
it("cria com cor e credenciais", async () => {
  responder(201);
  expect((await api.createGame("black")).id).toBe("game");
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toMatch(/\/games$/);
  expect(options?.credentials).toBe("include");
  expect(JSON.parse(options?.body as string)).toEqual({ human_color: "black" });
});
it("consulta id codificado", async () => {
  responder(); await api.getGame("a/b");
  expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/games\/a%2Fb$/);
  expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("include");
});
it("envia intenção, revisão e idempotência, sem FEN", async () => {
  responder(); const payload = { move: "e2e4", version: 0, client_move_id: "uuid" };
  await api.submitHumanMove("game", payload);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toMatch(/\/games\/game\/moves$/);
  expect(options?.credentials).toBe("include");
  expect(JSON.parse(options?.body as string)).toEqual(payload);
});
it("preserva código operacional", async () => {
  responder(409, { code: "not_human_turn", message: "Aguarde o agente" });
  const error = await api.submitHumanMove("game", { move: "e2e4", version: 0, client_move_id: "uuid" }).catch(e => e);
  expect(error).toBeInstanceOf(ErroDePartida);
  expect(error.erro.code).toBe("not_human_turn");
  expect(error.status).toBe(409);
});
it("401 invalida sessão pelo evento existente mesmo sem JSON", async () => {
  const listener = vi.fn(); window.addEventListener("xadrez:session-expired", listener);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
  try { await expect(api.getGame("game")).rejects.toBeInstanceOf(ErroDePartida); expect(listener).toHaveBeenCalledTimes(1); }
  finally { window.removeEventListener("xadrez:session-expired", listener); }
});

it("retoma agente com revisão, credenciais e nenhum lance do cliente", async () => {
  responder(); await api.resumeAgent("game", 3);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toMatch(/\/games\/game\/agent-move$/);
  expect(options?.credentials).toBe("include");
  expect(JSON.parse(options?.body as string)).toEqual({ version: 3 });
});
it("401 na retomada invalida sessão", async () => {
  const listener = vi.fn(); window.addEventListener("xadrez:session-expired", listener);
  responder(401, { code: "unauthenticated", message: "Sessão expirada" });
  try { await expect(api.resumeAgent("game", 1)).rejects.toBeInstanceOf(ErroDePartida); expect(listener).toHaveBeenCalledTimes(1); }
  finally { window.removeEventListener("xadrez:session-expired", listener); }
});

it("envia agent_id escolhido com credenciais", async () => {
  responder(201); await api.createGame("white", "aggressive");
  const options = vi.mocked(fetch).mock.calls[0][1];
  expect(JSON.parse(options?.body as string)).toEqual({ human_color: "white", agent_id: "aggressive" });
  expect(options?.credentials).toBe("include");
});
it("consulta catálogo autenticado e invalida sessão em 401", async () => {
  responder(200, []); expect(await api.agents()).toEqual([]);
  expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/agents$/);
  expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("include");
  const listener = vi.fn(); window.addEventListener("xadrez:session-expired", listener);
  responder(401, {});
  try { await expect(api.agents()).rejects.toBeInstanceOf(ErroDePartida); expect(listener).toHaveBeenCalledTimes(1); }
  finally { window.removeEventListener("xadrez:session-expired", listener); }
});

it("lista com filtro/paginação e credenciais", async () => {
  responder(200,{games:[],next_offset:null}); await api.listGames("finished",20);
  expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/games\?status=finished&limit=20&offset=20$/);
  expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("include");
});
it("criação envia chave estável e listagem 401 invalida sessão", async () => {
  responder(201); await api.createGame("black","aggressive","key");
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).client_game_id).toBe("key");
  const listener=vi.fn();window.addEventListener("xadrez:session-expired",listener);responder(401,{});
  try { await expect(api.listGames()).rejects.toBeInstanceOf(ErroDePartida);expect(listener).toHaveBeenCalledTimes(1); }
  finally { window.removeEventListener("xadrez:session-expired",listener); }
});

it("replay e revisão autenticados com ply/revisão e ID codificado",async()=>{
 responder();await api.gameReplay("a/b");expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/games\/a%2Fb\/replay$/);expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("include");await api.reviewGame("g",3,5);expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual({ply:3,version:5});
});
it("PGN retorna texto do servidor com credenciais",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response('1. e4 *\n')));expect(await api.gamePgn("g")).toBe('1. e4 *\n');expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/games\/g\/pgn$/);expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("include");
});
it.each(["gamePgn","gameReplay","reviewGame"] as const)("401 de %s invalida sessão",async(method)=>{
 const listener=vi.fn();window.addEventListener("xadrez:session-expired",listener);responder(401,{});
 try {await expect(api[method]("g",0,0)).rejects.toBeInstanceOf(ErroDePartida);expect(listener).toHaveBeenCalledTimes(1);}finally {window.removeEventListener("xadrez:session-expired",listener);}
});
