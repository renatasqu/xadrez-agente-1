import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  if (!screen.queryByRole("dialog", { name: "LIÇÕES" })) fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  expect(await within(screen.getByRole("dialog", { name: "LIÇÕES" })).findByText("O en passant é...")).toBeTruthy();
  expect(screen.getByText(/Retomando · Lição 3\/12/)).toBeTruthy();
  expect(chamadas).toContain(`/licao/atual?usuario_id=${ID}`);
  expect(await screen.findByText("Servidor disponível")).toBeTruthy();
});

it("sem id guardado consulta lição pela sessão", async () => {
  const chamadas = servidor({ "/health": [200, SAUDE] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  await screen.findByText("Servidor disponível");
  expect(chamadas).toContain("/licao/atual");
});

it("id inválido é apagado", async () => {
  gravarUsuarioId("lixo");
  servidor({ "/health": [200, SAUDE], "/licao/atual": [400, { resposta: "inválido", fontes: [], agente: "roteador", confianca: 0 }] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  await waitFor(() => expect(lerUsuarioId()).toBeNull());
});

it("erro da API aparece no chat com o .resposta do backend", async () => {
  servidor({
    "/health": [200, SAUDE],
    "/chat": [429, { resposta: "Muitas perguntas em pouco tempo.", fontes: [], agente: "roteador", confianca: 0 }],
  });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  if (!screen.queryByRole("dialog", { name: "SEU TUTOR" })) fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "roque?" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  expect(await screen.findByText("Muitas perguntas em pouco tempo.")).toBeTruthy();
});

it("próxima lição guarda o id novo", async () => {
  servidor({ "/health": [200, SAUDE], "/licao/proxima": [200, LICAO] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Começar lições" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Começar lições" }));
  if (!screen.queryByRole("dialog", { name: "LIÇÕES" })) fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  expect(await within(screen.getByRole("dialog", { name: "LIÇÕES" })).findByText("O en passant é...")).toBeTruthy();
  expect(lerUsuarioId()).toBe(ID);
  expect(screen.getByRole("button", { name: "Próxima lição" })).toBeTruthy();
});

it("mostra o rodapé Sobre com os documentos e o aviso de IA", () => {
  servidor({ "/health": [200, SAUDE] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  expect(screen.getByText("Chess Fundamentals")).toBeTruthy();
  expect(screen.getByText(/geradas por IA/)).toBeTruthy();
});

it("mostra os dois lados no cabeçalho, com aria-label nos avatares", () => {
  servidor({ "/health": [200, SAUDE] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  expect(screen.getByRole("img", { name: "avatar do Magnus" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "avatar do Hans" })).toBeTruthy();
  expect(screen.getByText("Vez das brancas no treino.")).toBeTruthy();
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
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Qual documento me ajuda?" }));
  expect(screen.queryByLabelText("Anexar posição do tabuleiro")).toBeNull();
  if (!screen.queryByRole("dialog", { name: "SEU TUTOR" })) fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "roque" } });
  fireEvent.click(screen.getByRole("button", { name: "Recomendar" }));
  expect(await screen.findByText("recomendação de leitura")).toBeTruthy();
  expect(screen.getByText("Castling is a move of the king.").tagName).toBe("MARK");
  expect(chamadas).toContain("/recomendar");
});


it("esconde o setup da IA quando a partida ativa já existe", async () => {
  window.location.hash = "partida";
  const officialFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
  servidor({ "/agents": [200, [{ id: "balanced", display_name: "Equilibrado", difficulty: "intermediate", style: "balanced", description: "Avaliação do motor" }]], "/health": [200, SAUDE], "/games": [201, {
    id: "ai-game", initial_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    current_fen: officialFen, moves: ["e2e4", "e7e5"], human_color: "white", side_to_move: "white",
    status: "playing", winner: null, terminal: false, awaiting_agent: false, version: 2, opponent: { type: "ai", agent_id: "balanced" },
  }], "/chat": [200, { resposta: "Tutor preservado", fontes: [], agente: "professor", confianca: 0 }] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: "Jogar contra IA" }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" })); });
  await screen.findByText("Histórico e revisão");
  expect(screen.queryByRole("button", { name: "Jogar contra IA" })).toBeNull();
  expect(screen.queryByLabelText("Seu lado")).toBeNull();
  expect(screen.getByText("Vez das brancas no treino.")).toBeTruthy();
});

it("alterna para IA sem desmontar a arena manual e anexa posição oficial ao tutor", async () => {
  window.location.hash = "partida";
  const officialFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
  servidor({ "/agents": [200, [{ id: "balanced", display_name: "Equilibrado", difficulty: "intermediate", style: "balanced", description: "Avaliação do motor" }]], "/health": [200, SAUDE], "/games": [201, {
    id: "ai-game", initial_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    current_fen: officialFen, moves: ["e2e4", "e7e5"], human_color: "white", side_to_move: "white",
    status: "playing", winner: null, terminal: false, awaiting_agent: false, version: 2, opponent: { type: "ai", agent_id: "balanced" },
  }], "/chat": [200, { resposta: "Tutor preservado", fontes: [], agente: "professor", confianca: 0 }] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  const arena = document.getElementById("partida")!;
  fireEvent.click(screen.getByRole("button", { name: "Jogar contra IA" }));
  await waitFor(() => expect(arena.hidden).toBe(true));
  await waitFor(() => expect((screen.getByRole("button", { name: "Iniciar partida contra IA" }) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Iniciar partida contra IA" })); });
  await screen.findByText("Histórico e revisão");
  expect(document.querySelector('[aria-label="Histórico oficial"]')).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Conversar sobre esta posição" }));
  fireEvent.click(screen.getByLabelText("Anexar posição do tabuleiro"));
  fireEvent.change(screen.getByLabelText("Sua pergunta"), { target: { value: "Explique a posição" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Enviar" })); });
  await screen.findByText("Tutor preservado");
  const chat = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith("/chat"));
  expect(JSON.parse(chat?.[1]?.body as string).context).toEqual({ source: "game", game_id: "ai-game" });
  expect(JSON.parse(chat?.[1]?.body as string).fen).toBeNull();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "SEU TUTOR" }), { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Voltar à partida manual" })).toBeNull();
  expect(document.getElementById("partida")).toBe(arena);
  expect(arena.hidden).toBe(true);
});

it("abre setup oficial por padrão e mantém arena manual oculta", async () => {
  window.history.replaceState(null, "", "#partida");
  servidor({ "/health": [200, SAUDE], "/agents": [200, [{ id: "balanced", display_name: "Equilibrado", difficulty: "intermediate", style: "balanced", description: "Motor" }]], "/games": [200, { games: [], next_offset: null }] });
  render(<App />);
  expect(screen.getByLabelText("Seu lado")).toBeTruthy();
  expect(document.getElementById("partida")?.hidden).toBe(true);
  expect(screen.queryByRole("button", { name: "Jogar contra IA" })).toBeNull();
  await screen.findByText("Nenhuma partida em andamento.");
});
