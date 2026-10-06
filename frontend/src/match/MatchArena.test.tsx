import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { App } from "../App";
import { api } from "../api";
import { apagarUsuarioId } from "../armazenamento";
import { FEN_INICIAL, tentarLance } from "../lances";
import type { Resposta } from "../types";
import { StatusSaude } from "../components/StatusSaude";
import { AgentHeaderCard, AgentThinking, CurrentTurn, MoveHistory, recordedMoves } from "./MatchArena";
import { MatchControls } from "./MatchControls";

vi.mock("../pixel/Sprite", () => ({ Sprite: ({ rotulo }: { rotulo: string }) => <span role={rotulo ? "img" : undefined} aria-label={rotulo || undefined} /> }));
vi.mock("../components/Board", () => ({ Board: (props: { fen: string; ocupado: boolean; modo: string; exibicao?: { fen: string }; onLance: (fen: string) => void }) => <div aria-label="Tabuleiro" data-fen={props.exibicao?.fen ?? props.fen} data-mode={props.modo}><button disabled={props.ocupado || props.modo !== "normal"} onClick={() => props.onLance(tentarLance(props.fen, props.fen.split(" ")[1] === "w" ? "e2" : "e7", props.fen.split(" ")[1] === "w" ? "e4" : "e5")!)}>Mover peça de teste</button></div> }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); window.history.replaceState(null, "", "/"); });
const HEALTH = { status: "ok" as const, stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" };
function health() { apagarUsuarioId(); vi.spyOn(api, "saude").mockResolvedValue(HEALTH); }
function positions() { const chess = new Chess(); const list = [chess.fen()]; for (const move of ["e4", "e5", "Nf3"]) { chess.move(move); list.push(chess.fen()); } return list; }
const analysis: Resposta = { agente: "analista", resposta: "Lado que joga: brancas.\nMelhor lance para as brancas: e4.\nAvaliação: posição equilibrada (+0,1).\nLinha principal: e4 e5.\n\nPor que esse lance: Este lance ocupa o centro.", fontes: [], confianca: 0 };

it("Magnus e Hans têm lados, relógios e destaque de turno corretos", () => {
  const view = render(<><AgentHeaderCard side="w" active seconds={75} /><AgentHeaderCard side="b" active={false} seconds={0} /><CurrentTurn side="w" /></>);
  expect(screen.getByRole("region", { name: "Magnus — Brancas" }).getAttribute("data-active")).toBe("true");
  expect(screen.getByRole("region", { name: "Hans — Pretas" }).getAttribute("data-active")).toBe("false");
  expect(screen.getByText("01:15")).toBeTruthy();
  view.rerender(<CurrentTurn side="b" />);
  expect(screen.getByRole("region", { name: "Turno atual" }).textContent).toContain("HansPretas");
});
it("histórico apresenta SAN em português, seleção e último lance", () => {
  const select = vi.fn(); const moves = recordedMoves(positions());
  expect(moves.map(move => move.san)).toEqual(["e4", "e5", "Nf3"]);
  render(<MoveHistory moves={moves} selected={3} onSelect={select} />);
  const selected = screen.getByRole("button", { name: "Ver posição após Cf3, jogada 3" });
  expect(selected.getAttribute("aria-current")).toBe("step");
  expect(screen.getByLabelText("Último lance")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ver posição após e4, jogada 1" }));
  expect(select).toHaveBeenCalledWith(1);
});
it("painéis independentes exibem só dados recebidos e análise em andamento", () => {
  render(<><AgentThinking side="w" busy analysis={analysis} /><AgentThinking side="b" /></>);
  const magnus = within(screen.getByRole("region", { name: "Análise de Magnus" }));
  const hans = within(screen.getByRole("region", { name: "Análise de Hans" }));
  expect(magnus.getByRole("status").textContent).toBe("Analisando…");
  expect(magnus.getByText("Este lance ocupa o centro.")).toBeTruthy();
  expect(hans.getByRole("status").textContent).toBe("Esperando");
  expect(hans.queryByText("Melhor lance")).toBeNull();
  expect(screen.queryByText(/Profundidade|Nós analisados/)).toBeNull();
});
it("estado vazio da análise é curto e não oferece detalhes sem dados", () => {
  const { container } = render(<AgentThinking side="b" />);
  expect(screen.getByText("Nenhuma análise ainda.")).toBeTruthy();
  expect(screen.queryByText(/A próxima descoberta/)).toBeNull();
  expect(screen.queryByText("Ver detalhes")).toBeNull();
  expect(container.querySelector(".agent-thinking--empty")).toBeTruthy();
});
it("análise recebida mostra resumo e mantém texto completo em detalhes fechados", () => {
  const { container } = render(<AgentThinking side="w" analysis={analysis} stale />);
  expect(screen.getByText("Este lance ocupa o centro.")).toBeTruthy();
  expect(screen.getByText("Melhor lance")).toBeTruthy();
  expect(screen.getByText("Avaliação")).toBeTruthy();
  expect(screen.getByText("Análise de uma posição anterior.")).toBeTruthy();
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.querySelector("summary")?.textContent).toBe("Ver detalhes");
  expect(details.querySelector(".thinking-full-text")?.textContent).toBe(analysis.resposta);
});
it("histórico vazio usa apresentação compacta", () => {
  const { container } = render(<MoveHistory moves={[]} selected={0} onSelect={vi.fn()} />);
  expect(screen.getByText("Nenhuma jogada ainda.")).toBeTruthy();
  expect(container.querySelector(".move-history--empty")).toBeTruthy();
});
it("controles acionam navegação, pausa e ações atuais", () => {
  const onFirst = vi.fn(), onPrevious = vi.fn(), onToggle = vi.fn(), onNext = vi.fn(), onUndo = vi.fn(), onReset = vi.fn(), onAnalyze = vi.fn();
  render(<MatchControls index={2} total={2} paused={false} disabled={false} onFirst={onFirst} onPrevious={onPrevious} onToggle={onToggle} onNext={onNext} onLive={vi.fn()} onUndo={onUndo} onReset={onReset} onAnalyze={onAnalyze} />);
  for (const [name, handler] of [["Primeira posição", onFirst], ["Anterior", onPrevious], ["Pausar partida", onToggle], ["Desfazer", onUndo], ["Reiniciar", onReset], ["Analisar posição", onAnalyze]] as const) {
    fireEvent.click(screen.getByRole("button", { name })); expect(handler).toHaveBeenCalledOnce();
  }
  expect((screen.getByRole("button", { name: "Próxima" }) as HTMLButtonElement).disabled).toBe(true);
});
it("navegação preserva a partida, pausa bloqueia input e desfazer continua disponível", async () => {
  health(); (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: "Mover peça de teste" }));
  expect(screen.getByRole("region", { name: "Hans — Pretas" }).getAttribute("data-active")).toBe("true");
  const current = screen.getByLabelText("Tabuleiro").getAttribute("data-fen");
  fireEvent.click(screen.getByRole("button", { name: "Primeira posição" }));
  expect(screen.getByLabelText("Tabuleiro").getAttribute("data-fen")).toBe(FEN_INICIAL);
  expect(screen.getByRole("button", { name: "Ver posição após e4, jogada 1" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Voltar à posição atual" }));
  expect(screen.getByLabelText("Tabuleiro").getAttribute("data-fen")).toBe(current);
  fireEvent.click(screen.getByRole("button", { name: "Pausar partida" }));
  expect((screen.getByRole("button", { name: "Mover peça de teste" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(screen.getByLabelText("Tabuleiro").getAttribute("data-fen")).toBe(FEN_INICIAL);
  expect(screen.queryByRole("button", { name: "Ver posição após e4, jogada 1" })).toBeNull();
});
it("análise é associada ao lado solicitado sem preencher o painel adversário", async () => {
  health(); let resolve!: (value: Resposta) => void;
  vi.spyOn(api, "analisar").mockImplementation(() => new Promise(done => { resolve = done; }));
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: "Analisar posição" }));
  expect(within(screen.getByRole("region", { name: "Análise de Magnus" })).getByRole("status").textContent).toBe("Analisando…");
  await act(async () => resolve(analysis));
  expect(within(screen.getByRole("region", { name: "Análise de Magnus" })).getByText("Este lance ocupa o centro.")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Análise de Hans" })).queryByText("Melhor lance")).toBeNull();
});
it("estado do servidor e latência vêm da consulta real de saúde", async () => {
  health(); const view = render(<StatusSaude />);
  expect(await screen.findByText("Servidor disponível")).toBeTruthy();
  expect(screen.getByText(/Latência: \d+ ms/)).toBeTruthy();
  view.unmount(); vi.mocked(api.saude).mockResolvedValue({ ...HEALTH, status: "degradado" });
  const degraded = render(<StatusSaude />);
  expect(await screen.findByText("Servidor parcialmente disponível")).toBeTruthy();
  degraded.unmount(); vi.mocked(api.saude).mockRejectedValue(new Error("network"));
  render(<StatusSaude />); expect(await screen.findByText("Servidor indisponível")).toBeTruthy();
});
it("estrutura responsiva conserva arena, painéis e tutor como regiões separadas", () => {
  health(); const { container } = (window.history.replaceState(null, "", "#explorar"), render(<App />));
  expect(container.querySelector(".arena-sidebar")).toBeNull();
  expect(container.querySelector(".game-header nav")).toBeTruthy();
  expect(container.querySelector(".agent-headers")).toBeTruthy();
  expect(container.querySelector(".match-game-column > .arena-board-main")).toBeTruthy();
  expect(container.querySelectorAll(".arena-reasoning .agent-thinking")).toHaveLength(2);
  expect(container.querySelector("#tutor-modal .tutor-panel")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("relógio mede atividade do lado atual, para durante pausa e reinicia", async () => {
  health(); vi.useFakeTimers();
  await act(async () => { (window.history.replaceState(null, "", "#explorar"), render(<App />)); });
  fireEvent.click(screen.getByRole("button", { name: "Mover peça de teste" }));
  await act(async () => vi.advanceTimersByTime(2100));
  const hans = within(screen.getByRole("region", { name: "Hans — Pretas" }));
  expect(hans.getByText("00:02")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pausar partida" }));
  await act(async () => vi.advanceTimersByTime(3000));
  expect(hans.getByText("00:02")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }));
  expect(hans.getByText("00:00")).toBeTruthy();
});

it("Sair confirma o encerramento e volta à Home preservando dados locais", async () => {
  health();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  window.history.replaceState(null, "", "/#agentes");
  localStorage.setItem("layout-preservation", "preservado");
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: "Mover peça de teste" }));
  fireEvent.click(screen.getByRole("link", { name: "Sair" }));
  expect(confirm).toHaveBeenCalledWith("Deseja sair da partida?");
  expect(await screen.findByRole("region", { name: "Tela inicial" })).toBeTruthy();
  expect(window.location.hash).toBe("#/");
  expect(screen.getByLabelText("Tabuleiro").getAttribute("data-fen")).toBe(FEN_INICIAL);
  expect(localStorage.getItem("layout-preservation")).toBe("preservado");
  localStorage.removeItem("layout-preservation");
});

it("histórico mobile começa recolhido e mantém contador e seleção ao abrir", () => {
  const media = window.matchMedia("(max-width: 899px)");
  vi.spyOn(window, "matchMedia").mockReturnValue({ ...media, matches: true });
  const select = vi.fn();
  const { container } = render(<MoveHistory moves={recordedMoves(positions())} selected={3} onSelect={select} />);
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.querySelector("summary")?.textContent).toContain("3");
  expect(details.querySelectorAll(".move-history-scroll button")).toHaveLength(3);
  fireEvent.click(details.querySelector("summary")!);
  expect(details.open).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Ver posição após e4, jogada 1" }));
  expect(select).toHaveBeenCalledWith(1);
});

it("páginas próprias pausam sem apagar a posição pedagógica ao retornar à prática", async () => {
  health();
  const { container } = (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: "Mover peça de teste" }));
  const boardElement = screen.getByLabelText("Tabuleiro");
  const fen = boardElement.getAttribute("data-fen");
  for (const [name, hash, page] of [["Lições", "#/licoes", "lessons"], ["Curiosidades", "#/curiosidades", "curiosities"], ["Sobre", "#/sobre", "about"]]) {
    const link = screen.queryByRole("link", { name });
    if (link) fireEvent.click(link);
    else {
      window.history.replaceState(null, "", hash);
      fireEvent(window, new Event("hashchange"));
    }
    // O acesso Sobre fica montado na arena; aguarde a navegação, não esse botão.
    await waitFor(() => expect(container.querySelector("#partida")?.hasAttribute("hidden")).toBe(true));
    if (page !== "about") expect(container.querySelector(`[data-page="${page}"]`)?.hasAttribute("hidden")).toBe(false);
    expect(window.location.hash).toBe(hash);
    if (link) expect(link.getAttribute("aria-current")).toBe("location");
    expect(container.querySelector("#partida")?.hasAttribute("hidden")).toBe(true);
    if (page === "about") {
      expect(screen.getByRole("dialog", { name: "SOBRE O PROJETO:" })).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });
    }
    window.history.replaceState(null, "", "#/pratica");
    fireEvent(window, new Event("hashchange"));
    await waitFor(() => expect(container.querySelector("#partida")?.hasAttribute("hidden")).toBe(false));
    expect(screen.getByLabelText("Tabuleiro")).toBe(boardElement);
    expect(boardElement.getAttribute("data-fen")).toBe(fen);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  }
});

it("cancelar Sair mantém a página, a posição e os controles da partida", () => {
  health();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  (window.history.replaceState(null, "", "#explorar"), render(<App />));
  fireEvent.click(screen.getByRole("button", { name: "Mover peça de teste" }));
  const fen = screen.getByLabelText("Tabuleiro").getAttribute("data-fen");
  fireEvent.click(screen.getByRole("link", { name: "Sair" }));
  expect(confirm).toHaveBeenCalledWith("Deseja sair da partida?");
  expect(screen.getByLabelText("Tabuleiro").getAttribute("data-fen")).toBe(fen);
  expect(screen.queryByRole("region", { name: "Tela inicial" })).toBeNull();
  expect(screen.getByRole("button", { name: "Pausar partida" })).toBeTruthy();
});
