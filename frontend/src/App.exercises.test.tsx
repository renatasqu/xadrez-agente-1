import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ItemDoChat } from "./components/Chat";
import type { BoardProps } from "./components/Board";
import type { useExercise } from "./exercises/useExercise";
import { App } from "./App";
import { apagarUsuarioId } from "./armazenamento";
import { FEN_INICIAL, tentarLance } from "./lances";
import { A1 } from "./testes/exercises";
import { factsParaVisual } from "./exercises/visual";

const capture = vi.hoisted(() => ({ items: [] as ItemDoChat[], board: null as BoardProps | null,
  session: null as ReturnType<typeof useExercise> | null }));
vi.mock("./components/Chat", () => ({ Chat: ({ itens }: { itens: ItemDoChat[] }) => {
  capture.items = itens; return null;
} }));
vi.mock("./components/Board", () => ({ Board: (props: BoardProps) => {
  capture.board = props;
  return <button onClick={() => props.onLance(tentarLance(props.fen, "e2", "e4")!)}>Lance normal de teste</button>;
} }));
vi.mock("./exercises/useExercise", () => ({ useExercise: () => capture.session }));
beforeEach(() => {
  apagarUsuarioId(); capture.items = []; capture.board = null;
  capture.session = { hint: null, currentHintLevel: 0, lastAction: null, pedirDica: vi.fn(), exercise: null, loading: false, validationResult: null, resulting_fen: null,
    history: [], operationalError: null, concluido: false, visual: factsParaVisual([]),
    carregar: vi.fn(), tentar: vi.fn(), fechar: vi.fn() };
});
afterEach(() => vi.unstubAllGlobals());
function servidor(lesson: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new URL(url).pathname === "/licao/atual" ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(
    new URL(url).pathname === "/health" ? { status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" } : lesson,
  ))));
}
it("associações só no envelope da lição chegam ao objeto do chat", async () => {
  servidor({ usuario_id: "id", concluido: false,
    licao: { numero: 1, total: 12, modulo: "regras", titulo: "Cavalo" },
    conteudo: { resposta: "Cavalo", fontes: [], agente: "arbitro", confianca: 0 },
    concept_ids: ["movimento_cavalo"], related_exercise_ids: [A1.id] });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Começar lições" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Começar lições" }));
  await waitFor(() => expect(capture.items).toHaveLength(1));
  expect(capture.items[0]).toMatchObject({ resposta: {
    concept_ids: ["movimento_cavalo"], related_exercise_ids: [A1.id],
  } });
});
it("lição/cache antigo recebe listas vazias", async () => {
  servidor({ usuario_id: "id", concluido: false, licao: null,
    conteudo: { resposta: "Antiga", fontes: [], agente: "arbitro", confianca: 0 } });
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  await waitFor(() => expect((screen.getByRole("button", { name: "Começar lições" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Começar lições" }));
  await waitFor(() => expect(capture.items).toHaveLength(1));
  expect(capture.items[0]).toMatchObject({ resposta: { concept_ids: [], related_exercise_ids: [] } });
});
it("exercício preserva histórico normal já jogado ao entrar e sair", async () => {
  servidor(null);
  const view = (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: "Lance normal de teste" }));
  const fenDaPartida = capture.board?.fen;
  expect(fenDaPartida).not.toBe(FEN_INICIAL);
  expect(capture.board?.podeDesfazer).toBe(true);
  const session = capture.session!;
  capture.session = { ...session, exercise: A1, resulting_fen: A1.fen };
  view.rerender(<App />);
  expect(capture.board?.modo).toBe("exercise");
  expect(capture.board?.exercicio?.fen).toBe(A1.fen);
  capture.board?.exercicio?.onTentativa({ type: "move", source: "b1", destination: "b3" });
  expect(session.tentar).toHaveBeenCalledWith({ type: "move", source: "b1", destination: "b3" });
  expect(capture.board?.fen).toBe(fenDaPartida);
  capture.session = session;
  view.rerender(<App />);
  expect(capture.board?.modo).toBe("normal");
  expect(capture.board?.fen).toBe(fenDaPartida);
  expect(capture.board?.podeDesfazer).toBe(true);
  await waitFor(() => expect(screen.getByText("Servidor disponível")).toBeTruthy());
});
