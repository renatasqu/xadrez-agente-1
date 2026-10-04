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
