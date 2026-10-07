import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { apagarUsuarioId } from "../armazenamento";

const SAUDE = { status: "ok", stockfish: true, indices: { regras: 120 }, chave_api: true, llm_provider: "anthropic" };
const ROQUE = {
  resposta: "O rei anda duas casas.", agente: "arbitro", confianca: 0.9,
  fontes: [{ documento: "d.pdf", titulo: "FIDE", local: "p. 1", trecho: "t" }],
  demonstracao: { fen_inicial: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", lances: ["O-O"], descricao: "Roque pequeno." },
};
const MATE = {
  ...ROQUE,
  demonstracao: {
    fen_inicial: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    lances: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
    descricao: "Mate do pastor.",
  },
};

function servidor(chat: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const caminho = new URL(url).pathname;
    return new Response(JSON.stringify(caminho === "/health" ? SAUDE : chat));
  }));
}

async function abrirDemo(chat: unknown) {
  servidor(chat);
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "roque?" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver no tabuleiro" }));
}

function casa(nome: string): HTMLElement {
  return document.querySelector(`[data-square="${nome}"]`) as HTMLElement;
}

/** A casa está destacada? (o estilo fica na casa, num filho ou no elemento em volta) */
function destacada(nome: string): boolean {
  const elemento = casa(nome);
  const candidatos = [elemento, elemento.parentElement, ...elemento.querySelectorAll<HTMLElement>("*")];
  return candidatos.some((el) => (el as HTMLElement | null)?.style?.boxShadow?.includes("4px"));
}

async function avancar(intervalos: number) {
  for (let i = 0; i < intervalos; i++) await act(async () => vi.advanceTimersByTime(1200));
}

beforeEach(() => apagarUsuarioId());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("mostra a demonstração, anda lance a lance e destaca as casas", async () => {
  await abrirDemo(ROQUE);
  expect(screen.getByText("Roque pequeno.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
  fireEvent.click(screen.getByRole("button", { name: "Lance anterior" }));
  expect(screen.getByText("Posição inicial · 1 lance")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Próximo lance" }));
  expect(screen.getByText("Lance 1 de 1: O-O")).toBeTruthy();
  expect(destacada("e1") && destacada("g1")).toBe(true);
  expect(destacada("a1")).toBe(false);
  expect(casa("g1").querySelector('[aria-label="rei branco"]')).toBeTruthy(); // o rei está em g1
});

it("tocar avança sozinho até o fim e pausar para", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  await abrirDemo(MATE);
  expect(screen.getByText("Posição inicial · 7 lances")).toBeTruthy();
  await avancar(2);
  expect(screen.getByText("Lance 2 de 7: e5")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pausar" }));
  await avancar(4);
  expect(screen.getByText("Lance 2 de 7: e5")).toBeTruthy(); // pausado, não andou
  fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
  await avancar(6);
  expect(screen.getByText("Lance 7 de 7: Dxf7#")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Tocar de novo" })).toBeTruthy();
});

it("durante a demonstração não dá para mexer nem analisar", async () => {
  await abrirDemo(ROQUE);
  expect((screen.getByRole("button", { name: "Analisar posição" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("Demonstração: sua posição de estudo está guardada.")).toBeTruthy();
});

it("voltar à minha posição restaura a partida da pessoa", async () => {
  await abrirDemo(ROQUE);
  fireEvent.click(screen.getByRole("button", { name: "Voltar à minha posição" }));
  expect(screen.queryByRole("region", { name: "Demonstração no tabuleiro" })).toBeNull();
  expect(screen.getByText("Vez das brancas no treino.")).toBeTruthy();
  expect(casa("e2").querySelector('[aria-label="peão branco"]')).toBeTruthy(); // posição inicial de volta
});

it("o lance atual é anunciado para leitores de tela", async () => {
  await abrirDemo(ROQUE);
  const anuncio = screen.getByText(/Posição inicial|Lance 1 de 1/);
  expect(anuncio.getAttribute("aria-live")).toBe("polite");
});
