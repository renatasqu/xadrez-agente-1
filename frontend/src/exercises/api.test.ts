import { afterEach, expect, it, vi } from "vitest";
import { api, ErroDaApi, ErroDeExercicio, MSG_SEM_SERVIDOR, TEMPO_MAXIMO_MS } from "../api";
import { apagarUsuarioId, gravarUsuarioId } from "../armazenamento";
import { A1, PARTIAL } from "../testes/exercises";
function responder(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}
afterEach(() => { apagarUsuarioId(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("carrega exercício e codifica seu ID", async () => {
  responder(200, A1);
  expect(await api.exercicio(A1.id)).toEqual(A1);
  await api.exercicio("../id");
  expect(vi.mocked(fetch).mock.calls[1][0]).toMatch(/\/exercises\/..%2Fid$/);
});
it("preserva ExerciseError sem criar Resposta", async () => {
  const body = { code: "version_mismatch", message: "Versão incompatível" };
  responder(409, body);
  const error = await api.validarExercicio(A1.id, { version: 2, action: { type: "move", source: "b1", destination: "b3" } }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ErroDeExercicio);
  expect(error).not.toBeInstanceOf(ErroDaApi);
  expect(error).toMatchObject({ erro: body, status: 409 });
  expect(error).not.toHaveProperty("resposta");
});
it("envia tentativa ilegal, history e UUID existente na query", async () => {
  const id = "f63e63f2-4ed6-494d-bf86-2fa2f95110fd";
  gravarUsuarioId(id);
  responder(200, PARTIAL);
  const payload = { version: 1, action: { type: "move" as const, source: "b1" as const, destination: "b3" as const }, history: [] };
  expect(await api.validarExercicio(A1.id, payload)).toEqual(PARTIAL);
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(`${new URL(String(url)).origin}/exercises/a1-cavalo/validate?usuario_id=${id}`);
  expect(JSON.parse(options!.body as string)).toEqual(payload);
});
it("suporta AnswerAction sem criar identificador", async () => {
  apagarUsuarioId(); responder(200, { ...PARTIAL, status: "correct" });
  await api.validarExercicio("a2-roque-pequeno", { version: 1, action: { type: "answer", answer: true } });
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(url).toMatch(/\/validate$/);
  expect(JSON.parse(options!.body as string).action).toEqual({ type: "answer", answer: true });
});
it("consulta progresso no endpoint real", async () => {
  const body = [{ exercise_id: A1.id, concept_id: "movimento_cavalo", status: "completed", attempts: 2, updated_at: "2026-10-03T00:00:00+00:00" }];
  responder(200, body);
  expect(await api.progressoExercicios("id&outro")).toEqual(body);
  expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/progresso\/exercicios\?usuario_id=id%26outro$/);
});
it("erros de progresso continuam no contrato legado", async () => {
  const body = { resposta: "UUID inválido", fontes: [], agente: "roteador", confianca: 0 };
  responder(422, body);
  await expect(api.progressoExercicios("inválido")).rejects.toMatchObject({ resposta: body, status: 422 });
});
it("falha de rede de exercício é operacional", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
  await expect(api.exercicio(A1.id)).rejects.toMatchObject({ erro: { code: "internal_error", message: MSG_SEM_SERVIDOR }, status: 0 });
});
it("corpo de erro desconhecido mantém contrato operacional", async () => {
  responder(500, { resposta: "erro inesperado" });
  await expect(api.exercicio(A1.id)).rejects.toBeInstanceOf(ErroDeExercicio);
});
it("timeout de exercício é operacional", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_, reject) => {
    options.signal?.addEventListener("abort", () => reject(new Error("abort")));
  })));
  const pending = api.exercicio(A1.id).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(TEMPO_MAXIMO_MS + 1);
  expect(await pending).toBeInstanceOf(ErroDeExercicio);
});
it("preserva associações de resposta e envelope de lição", async () => {
  const body = { resposta: "Cavalo", fontes: [], agente: "arbitro", confianca: 0,
    concept_ids: ["movimento_cavalo"], related_exercise_ids: [A1.id] };
  responder(200, body);
  expect(await api.perguntar("cavalo")).toEqual(body);
  const lesson = { usuario_id: "id", concluido: false, licao: null, conteudo: body,
    concept_ids: body.concept_ids, related_exercise_ids: body.related_exercise_ids };
  responder(200, lesson);
  expect(await api.proximaLicao(null)).toEqual(lesson);
});
