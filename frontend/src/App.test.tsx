import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { apagarUsuarioId, gravarUsuarioId, lerUsuarioId } from "./armazenamento";

const ID = "f63e63f2-4ed6-494d-bf86-2fa2f95110fd";
const LICAO = {
  usuario_id: ID,
  concluido: false,
  licao: { numero: 3, total: 12, modulo: "regras", titulo: "En passant" },
  conteudo: { resposta: "O en passant é...", fontes: [{ documento: "d", titulo: "FIDE", local: "p. 1", trecho: "t" }], agente: "arbitro", confianca: 0.8 },
};
const SAUDE = { status: "ok", stockfish: true, indices: { regras: 120 }, chave_api: true, llm_provider: "anthropic" };

function servidor(rotas: Record<string, [number, unknown]>) {
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const caminho = new URL(url).pathname;
    chamadas.push(caminho + new URL(url).search);
    const [status, corpo] = rotas[caminho] ?? [404, { resposta: "?", fontes: [], agente: "roteador", confianca: 0 }];
    return new Response(JSON.stringify(corpo), { status });
  }));
  return chamadas;
}

beforeEach(() => apagarUsuarioId());
afterEach(() => vi.unstubAllGlobals());

it("retoma a lição atual ao abrir quando há id guardado", async () => {
  gravarUsuarioId(ID);
  const chamadas = servidor({ "/health": [200, SAUDE], "/licao/atual": [200, LICAO] });
  render(<App />);
  expect(await screen.findByText("O en passant é...")).toBeTruthy();
  expect(screen.getByText(/Retomando · Lição 3\/12/)).toBeTruthy();
  expect(chamadas).toContain(`/licao/atual?usuario_id=${ID}`);
  expect(await screen.findByText("Servidor ok")).toBeTruthy();
});

it("sem id guardado não chama /licao/atual", async () => {
  const chamadas = servidor({ "/health": [200, SAUDE] });
  render(<App />);
  await screen.findByText("Servidor ok");
  expect(chamadas.some((c) => c.startsWith("/licao/atual"))).toBe(false);
});

it("id inválido é apagado", async () => {
  gravarUsuarioId("lixo");
  servidor({ "/health": [200, SAUDE], "/licao/atual": [400, { resposta: "inválido", fontes: [], agente: "roteador", confianca: 0 }] });
  render(<App />);
  await waitFor(() => expect(lerUsuarioId()).toBeNull());
});

it("erro da API aparece no chat com o .resposta do backend", async () => {
  servidor({
    "/health": [200, SAUDE],
    "/chat": [429, { resposta: "Muitas perguntas em pouco tempo.", fontes: [], agente: "roteador", confianca: 0 }],
  });
  render(<App />);
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "roque?" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(await screen.findByText("Muitas perguntas em pouco tempo.")).toBeTruthy();
});

it("próxima lição guarda o id novo", async () => {
  servidor({ "/health": [200, SAUDE], "/licao/proxima": [200, LICAO] });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Começar lições" }));
  expect(await screen.findByText("O en passant é...")).toBeTruthy();
  expect(lerUsuarioId()).toBe(ID);
  expect(screen.getByRole("button", { name: "Próxima lição" })).toBeTruthy();
});

it("mostra o rodapé Sobre com os documentos e o aviso de IA", () => {
  servidor({ "/health": [200, SAUDE] });
  render(<App />);
  expect(screen.getByText("Chess Fundamentals")).toBeTruthy();
  expect(screen.getByText(/geradas por IA/)).toBeTruthy();
});

it("mostra os dois lados no cabeçalho, com aria-label nos avatares", () => {
  servidor({ "/health": [200, SAUDE] });
  render(<App />);
  expect(screen.getByRole("img", { name: "avatar do Magnus" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "avatar do Hans" })).toBeTruthy();
  expect(screen.getByText("Vez do Magnus (brancas).")).toBeTruthy();
});

it("modo Qual documento me ajuda? chama /recomendar e mostra os trechos", async () => {
  const chamadas = servidor({
    "/health": [200, SAUDE],
    "/recomendar": [200, {
      resposta: "Estes trechos dos documentos falam da sua dúvida:", fontes: [], agente: "roteador", confianca: 0,
      onde_ler: [{
        documento: "Laws_of_Chess-2023.pdf", titulo: "FIDE Laws of Chess", autor: "FIDE", local: "p. 1, § 3.8",
        pagina: 1, chunk_id: "c1", trecho: "Castling is a move of the king.", frase_destaque: "Castling is a move of the king.", score: 0.85,
      }],
    }],
  });
  render(<App />);
  fireEvent.click(screen.getByRole("radio", { name: "Qual documento me ajuda?" }));
  expect(screen.queryByLabelText("Anexar posição do tabuleiro")).toBeNull();
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "roque" } });
  fireEvent.click(screen.getByRole("button", { name: "Recomendar" }));
  expect(await screen.findByText("recomendação de leitura")).toBeTruthy();
  expect(screen.getByText("Castling is a move of the king.").tagName).toBe("MARK");
  expect(chamadas).toContain("/recomendar");
});
