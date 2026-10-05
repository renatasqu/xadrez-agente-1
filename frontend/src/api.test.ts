import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroDaApi, MSG_SEM_SERVIDOR, MSG_TEMPO_ESGOTADO, TEMPO_MAXIMO_MS, api, urlDoDocumento } from "./api";

function responder(status: number, corpo: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(corpo), { status })));
}

const erroDoBackend = (texto: string) => ({ resposta: texto, fontes: [], agente: "roteador", confianca: 0 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("api", () => {
  it("devolve a Resposta quando dá certo", async () => {
    responder(200, { resposta: "O roque...", fontes: [], agente: "arbitro", confianca: 0.9 });
    expect((await api.perguntar("roque")).agente).toBe("arbitro");
  });

  it.each([429, 504, 500, 422, 503])("em erro %i mostra o .resposta do backend", async (status) => {
    responder(status, erroDoBackend(`mensagem do backend ${status}`));
    const erro = await api.perguntar("roque").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDaApi);
    expect(erro.message).toBe(`mensagem do backend ${status}`);
    expect(erro.status).toBe(status);
    expect(erro.resposta.resposta).toBe(`mensagem do backend ${status}`);
  });

  it("sem servidor dá uma mensagem amigável", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(api.saude()).rejects.toThrow(MSG_SEM_SERVIDOR);
  });

  it("corta a espera depois do tempo máximo", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, opcoes: RequestInit) =>
      new Promise((_, rejeitar) => opcoes.signal?.addEventListener("abort", () => rejeitar(new DOMException("abort")))),
    ));
    const promessa = api.analisar("fen").catch((e) => e);
    await vi.advanceTimersByTimeAsync(TEMPO_MAXIMO_MS + 1);
    expect((await promessa).message).toBe(MSG_TEMPO_ESGOTADO);
  });

  it("envia os campos que o backend espera", async () => {
    responder(200, { usuario_id: "x", concluido: false, licao: null, conteudo: null });
    await api.proximaLicao(null);
    const [url, opcoes] = vi.mocked(fetch).mock.calls[0];
    expect(url).toMatch(/\/licao\/proxima$/);
    expect(JSON.parse(opcoes!.body as string)).toEqual({ usuario_id: null });
  });
});

it("url do documento: PDF com página, TXT sem, nome codificado", () => {
  expect(urlDoDocumento("Laws_of_Chess-2023.pdf", 2)).toMatch(/\/documentos\/Laws_of_Chess-2023\.pdf#page=2$/);
  expect(urlDoDocumento("livro.txt", 3)).toMatch(/\/documentos\/livro\.txt$/);
  expect(urlDoDocumento("../.env")).toContain("/documentos/..%2F.env");
});

it("transporta cookie HttpOnly nas chamadas privadas", async () => {
  responder(200, {});
  await api.perguntar("roque");
  expect(vi.mocked(fetch).mock.calls[0][1]?.credentials).toBe("include");
});

it.each(["chat", "exercise"])("sinaliza sessão expirada mesmo com corpo inválido em %s", async (kind) => {
  const listener = vi.fn();
  window.addEventListener("xadrez:session-expired", listener);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
  try {
    await expect(kind === "chat" ? api.perguntar("roque") : api.exercicio("a1-cavalo")).rejects.toThrow();
    expect(listener).toHaveBeenCalledOnce();
  } finally { window.removeEventListener("xadrez:session-expired", listener); }
});

it("401 público não encerra a sessão", async () => {
  const listener = vi.fn();
  window.addEventListener("xadrez:session-expired", listener);
  responder(401, {});
  try { await expect(api.saude()).rejects.toThrow(); expect(listener).not.toHaveBeenCalled(); }
  finally { window.removeEventListener("xadrez:session-expired", listener); }
});
