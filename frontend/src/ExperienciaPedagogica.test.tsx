import { textoPedagogico } from "./idioma";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { apagarUsuarioId, gravarUsuarioId } from "./armazenamento";
import { CENARIOS } from "./testes/pedagogia";
import type { ValidationRequest } from "./types";

beforeEach(() => apagarUsuarioId());
afterEach(() => vi.unstubAllGlobals());
const ID = "f63e63f2-4ed6-494d-bf86-2fa2f95110fd";
function servidor(key: string, respostas: string[], operational = false, withDemo = false) {
  const { exercise, results } = CENARIOS[key];
  const payloads: ValidationRequest[] = [];
  const urls: string[] = [];
  const resposta = { resposta: "Explicação do conceito preservada.", fontes: [], agente: "analista", confianca: 0,
    related_exercise_ids: [exercise.id], demonstracao: withDemo ? {
      fen_inicial: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", lances: ["O-O"], descricao: "Demonstração de roque." } : null };
  const lesson = { usuario_id: ID, concluido: false,
    licao: { numero: 1, total: 12, titulo: "Lição preservada", modulo: "regras" },
    conteudo: resposta, related_exercise_ids: [exercise.id] };
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    const path = new URL(url).pathname; urls.push(url);
    let body: unknown; let status = 200;
    if (path === "/health") body = { status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" };
    else if (path === "/chat" || path === "/analisar") body = resposta;
    else if (path === "/licao/atual" && !new URL(url).search) { status = 404; body = { resposta: "Nenhuma lição" }; }
    else if (path === "/licao/proxima" || path === "/licao/atual") body = lesson;
    else if (path === "/progresso/exercicios") body = payloads.length ? [{ exercise_id: exercise.id,
      concept_id: "movimento_cavalo", status: "completed", attempts: payloads.length, updated_at: "2026-10-04T00:00:00Z" }] : [];
    else if (path.endsWith("/validate")) {
      payloads.push(JSON.parse(options!.body as string) as ValidationRequest);
      if (operational) { status = 409; body = { code: "version_mismatch", message: "Versão incompatível: recarregue o exercício." }; }
      else body = results[respostas[payloads.length - 1]];
    } else if (path === `/exercises/${exercise.id}`) body = exercise;
    else { status = 404; body = { code: "exercise_not_found", message: "Exercício inexistente" }; }
    return new Response(JSON.stringify(body), { status });
  }));
  return { payloads, urls, exercise };
}
async function abrirChat(key: string, respostas: string[], operational = false) {
  const state = servidor(key, respostas, operational);
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "Explique este conceito." } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  fireEvent.click(await screen.findByRole("button", { name: /Praticar este conceito/ }));
  await screen.findByText(textoPedagogico(state.exercise.prompt), {}, { timeout: 3000 });
  if (key !== "a2") await waitFor(() => expect(casa("e7").querySelector('[aria-label="peão preto"]')).toBeNull(), { timeout: 3000 });
  return state;
}
function casa(square: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-square="${square}"]`);
  if (!element) throw new Error(`Casa ausente: ${square}`);
  return element;
}
function mover(source: string, destination: string) {
  fireEvent.click(casa(source)); fireEvent.click(casa(destination));
}
it("A1: CTA, tentativa ilegal, feedback, nova tentativa e conclusão", async () => {
  const { payloads } = await abrirChat("a1", ["incorrect", "correct"]);
  mover("b1", "b3");
  await screen.findByText("Tente novamente.", {}, { timeout: 3000 });
  expect(screen.getByText("O cavalo não se move em linha reta.")).toBeTruthy();
  expect(screen.getByText("Origem da tentativa: b1.")).toBeTruthy();
  expect(screen.getByText("Destino da tentativa: b3.")).toBeTruthy();
  await waitFor(() => expect(casa("b1").querySelector('[aria-label="cavalo branco"]')).toBeTruthy());
  expect(payloads[0].action).toEqual({ type: "move", source: "b1", destination: "b3" });
  mover("b1", "c3");
  await screen.findByText("Exercício concluído.", {}, { timeout: 3000 });
  await waitFor(() => expect(casa("c3").querySelector('[aria-label="cavalo branco"]')).toBeTruthy());
  expect(payloads).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  expect(within(screen.getByRole("dialog", { name: "SEU TUTOR" })).getByText("Explicação do conceito preservada.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fechar seu tutor" }));
  fireEvent.click(screen.getByRole("button", { name: "Fechar exercício e voltar à minha posição" }));
  await waitFor(() => expect(casa("e2").querySelector('[aria-label="peão branco"]')).toBeTruthy());
});
it("A2: NÃO conclui e destaca bloqueios com descrição textual", async () => {
  const { payloads } = await abrirChat("a2", ["correct"]);
  fireEvent.click(screen.getByRole("button", { name: "NÃO" }));
  await screen.findByText("Exercício concluído.", {}, { timeout: 3000 });
  expect(payloads[0].action).toEqual({ type: "answer", answer: false });
  expect(screen.getByText("Há peças bloqueando o caminho do roque.")).toBeTruthy();
  expect(screen.getByText("Casas destacadas: f1, g1.")).toBeTruthy();
});
it("A3: partial aplica resposta adversária e segundo lance usa history canônico", async () => {
  const { payloads } = await abrirChat("a3", ["partial", "correct"]);
  mover("b5", "c7"); await screen.findByText("Boa. Agora continue.", {}, { timeout: 3000 });
  expect(screen.getByText(/Resposta adversária aplicada: e8d7/)).toBeTruthy();
  await waitFor(() => expect(casa("d7").querySelector('[aria-label="rei preto"]')).toBeTruthy());
  await waitFor(() => expect(casa("c7").querySelector('[aria-label="cavalo branco"]')).toBeTruthy());
  mover("c7", "a8"); await screen.findByText("Exercício concluído.", {}, { timeout: 3000 });
  expect(payloads[1].history).toEqual(CENARIOS.a3.results.partial.history);
  expect(payloads[1].action).toEqual({ type: "move", source: "c7", destination: "a8" });
});
it("E1: lance seguro conclui com posição do servidor", async () => {
  await abrirChat("e1", ["correct"]);
  mover("c3", "a4"); await screen.findByText("Exercício concluído.", {}, { timeout: 3000 });
  await waitFor(() => expect(casa("a4").querySelector('[aria-label="cavalo branco"]')).toBeTruthy());
});
it("E1: perda material preserva posição e permite visualizar a refutação", async () => {
  await abrirChat("e1", ["incorrect"]);
  mover("e1", "f2"); await screen.findByText("Tente novamente.", {}, { timeout: 3000 });
  expect(screen.getByText("Esse lance permite uma perda de material.")).toBeTruthy();
  expect(screen.getByText("Variação material da linha: -3.")).toBeTruthy();
  await waitFor(() => expect(casa("e1").querySelector('[aria-label="rei branco"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Ver sequência de refutação" }));
  fireEvent.click(screen.getByRole("button", { name: "Próximo na refutação" }));
  await waitFor(() => expect(casa("f2").querySelector('[aria-label="rei branco"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Próximo na refutação" }));
  await waitFor(() => expect(casa("c3").querySelector('[aria-label="torre preta"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Voltar ao exercício" }));
  await waitFor(() => expect(casa("e1").querySelector('[aria-label="rei branco"]')).toBeTruthy());
  await waitFor(() => expect(casa("c3").querySelector('[aria-label="cavalo branco"]')).toBeTruthy());
});
it("E1: allows_mate anuncia risco, destaca rei e mostra linha recebida", async () => {
  await abrirChat("mate", ["incorrect"]);
  mover("g2", "g4"); await screen.findByText("Tente novamente.", {}, { timeout: 3000 });
  expect(screen.getByText("Esse lance permite xeque-mate imediato.")).toBeTruthy();
  expect(screen.getByText("Rei em xeque-mate na refutação: e1.")).toBeTruthy();
  await waitFor(() => expect(casa("g2").querySelector('[aria-label="peão branco"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Ver sequência de refutação" }));
  fireEvent.click(screen.getByRole("button", { name: "Próximo na refutação" }));
  fireEvent.click(screen.getByRole("button", { name: "Próximo na refutação" }));
  await waitFor(() => expect(casa("h4").querySelector('[aria-label="dama preta"]')).toBeTruthy());
}, 10_000); // Sequência completa de refutação com sprites SVG e modais persistentes.
it("erro operacional mostra mensagem de API sem feedback incorrect", async () => {
  await abrirChat("a1", [], true);
  mover("b1", "c3"); await screen.findByText("Versão incompatível: recarregue o exercício.");
  expect(screen.queryByText("Tente novamente.")).toBeNull();
  expect(screen.queryByText("Exercício concluído.")).toBeNull();
  await waitFor(() => expect(casa("b1").querySelector('[aria-label="cavalo branco"]')).toBeTruthy());
});
it("CTA da lição preserva lição/conversa e consulta progresso sem POST adicional", async () => {
  const { payloads, urls } = servidor("a1", ["correct"]);
  gravarUsuarioId(ID); (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  const lessons = screen.getByRole("region", { name: "Lições" });
  fireEvent.click(await within(lessons).findByRole("button", { name: /Praticar este conceito/ }));
  await screen.findByText(CENARIOS.a1.exercise.prompt);
  mover("b1", "c3"); await screen.findByText("Exercício concluído.", {}, { timeout: 3000 });
  await screen.findByText("Progresso: concluído · Tentativas: 1");
  expect(screen.getAllByText(/Lição preservada/).length).toBeGreaterThan(0);
  expect(payloads).toHaveLength(1);
  expect(urls.some((url) => url.includes(`/validate?usuario_id=${ID}`))).toBe(true);
  expect(urls.filter((url) => url.includes("/progresso/exercicios")).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Fechar exercício e voltar à minha posição" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Exercício" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  expect(within(screen.getByRole("dialog", { name: "LIÇÕES" })).getByText("Explicação do conceito preservada.")).toBeTruthy();
});


it("abrir prática encerra demo e fechar restaura exatamente a partida já jogada", async () => {
  servidor("a1", ["correct"], false, true);
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  mover("e2", "e4");
  await waitFor(() => expect(casa("e4").querySelector('[aria-label="peão branco"]')).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "Como funciona o cavalo?" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver no tabuleiro" }));
  expect(screen.getByRole("region", { name: "Demonstração no tabuleiro" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  fireEvent.click(screen.getByRole("button", { name: /Praticar este conceito/ }));
  await screen.findByText(CENARIOS.a1.exercise.prompt);
  expect(screen.queryByRole("region", { name: "Demonstração no tabuleiro" })).toBeNull();
  mover("b1", "c3"); await screen.findByText("Exercício concluído.", {}, { timeout: 3000 });
  fireEvent.click(screen.getByRole("button", { name: "Fechar exercício e voltar à minha posição" }));
  await waitFor(() => expect(casa("e4").querySelector('[aria-label="peão branco"]')).toBeTruthy());
  expect(casa("e2").querySelector('[aria-label="peão branco"]')).toBeNull();
  expect(screen.getByText("Vez do Hans (pretas).")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Desfazer" }) as HTMLButtonElement).disabled).toBe(false);
}, 10_000); // Partida, demonstração, modal e exercício no mesmo fluxo de integração.
