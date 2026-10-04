import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { apagarUsuarioId } from "./armazenamento";
import { idiomaDaFonte, localDaFonte, rotuloDoTrecho, textoDaAnalise, textoPedagogico } from "./idioma";
import { Fontes } from "./components/Fontes";
import { RespostaDoAgente } from "./components/Mensagem";
import { ExercisePanel } from "./components/ExercisePanel";
import { estadoInicial } from "./exercises/estado";
import { factsParaVisual } from "./exercises/visual";
import { feedbackDosFacts } from "./exercises/pedagogia";
import { CENARIOS } from "./testes/pedagogia";
import { rotuloDaPeca, type Tipo } from "./pixel/rotulos";

// Mantém rótulos reais sem desenhar milhares de pixels nos testes de texto.
vi.mock("./pixel/Sprite", () => ({ Sprite: ({ rotulo }: { rotulo: string }) => <span role={rotulo ? "img" : undefined} aria-label={rotulo || undefined} /> }));

const INGLES_DA_UI = /\b(loading|retry|submit|cancel|close|next|previous|hint|history|correct|incorrect|partial|offline|king|queen|rook|bishop|knight|pawn|checkmate|stalemate|castling|promotion|fork|plies)\b/i;
afterEach(() => vi.unstubAllGlobals());

it("interface principal e nomes acessíveis usam português; títulos oficiais são preservados", async () => {
  apagarUsuarioId();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "ok", stockfish: true, indices: {}, chave_api: true }))));
  const { container } = render(<App />);
  expect(await screen.findByText("Servidor disponível")).toBeTruthy();
  await waitFor(() => expect(container.textContent).not.toContain("To pick up a draggable item"));
  const ui = container.cloneNode(true) as HTMLElement;
  ui.querySelectorAll("footer em").forEach(node => node.remove());
  expect(ui.textContent).not.toMatch(INGLES_DA_UI);
  for (const node of ui.querySelectorAll("[aria-label], [placeholder], [title], [aria-roledescription]")) {
    for (const attribute of ["aria-label", "placeholder", "title", "aria-roledescription"]) {
      expect(node.getAttribute(attribute) ?? "").not.toMatch(INGLES_DA_UI);
    }
  }
  expect(screen.getByText("Chess Fundamentals")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  expect(screen.getByRole("textbox", { name: "Sua pergunta" }).getAttribute("placeholder")).toContain("Como funciona o roque");
});

it("indisponibilidade do servidor é apresentada em português", async () => {
  apagarUsuarioId();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  render(<App />);
  expect(await screen.findByText("Servidor indisponível")).toBeTruthy();
});

it("labels de fontes são pt-BR e o trecho original em inglês permanece integral", () => {
  const trecho = "A fork is an attack on two pieces.";
  render(<Fontes fontes={[{ documento: "regis_tactics.pdf", titulo: "Ten Steps to Learn Chess Tactics and Combinations", local: "p. 14, § 2", trecho }]} />);
  fireEvent.click(screen.getByRole("button", { name: /Ten Steps/ }));
  expect(screen.getByText("Trecho da fonte original (em inglês)")).toBeTruthy();
  expect(screen.getByText(trecho).getAttribute("lang")).toBe("en");
  expect(screen.getByRole("button", { name: /Página 14, Artigo 2/ })).toBeTruthy();
  expect(rotuloDoTrecho("desconhecido.pdf")).toBe("Trecho da fonte original");
  expect(idiomaDaFonte("desconhecido.pdf")).toBeUndefined();
  expect(localDaFonte("linhas 801-880")).toBe("linhas 801-880");
});

it("Stockfish apresenta labels e avaliação pt-BR e preserva SAN", () => {
  const texto = "Lado que joga: pretas.\nMelhor lance: Nf6.\nAvaliação: posição equilibrada (+0.1).\nLinha principal: Nf6 d4 e4.";
  render(<RespostaDoAgente resposta={{ resposta: texto, fontes: [{ documento: "stockfish", titulo: "Stockfish", local: "análise de 1 s", trecho: texto }], agente: "analista", confianca: 1 }} />);
  const explanation = document.querySelector(".answer-explanation")!;
  expect(explanation.textContent).toContain("Lado que joga: pretas.");
  expect(explanation.textContent).toContain("Melhor lance: Nf6.");
  expect(explanation.textContent).toContain("Avaliação: posição equilibrada (+0,1).");
  expect(explanation.textContent).toContain("Linha principal: Nf6 d4 e4.");
  fireEvent.click(screen.getByRole("button", { name: /Motor: Stockfish/ }));
  expect(screen.getByText("Análise do Stockfish")).toBeTruthy();
  expect(document.querySelector("blockquote")?.textContent).toContain("(+0,1)");
  expect(screen.queryByText("Trecho da fonte original (em inglês)")).toBeNull();
  expect(textoDaAnalise("Avaliação: mate em 2 para as brancas.")).toBe("Avaliação: xeque-mate em 2 para as brancas.");
});

it("objetivo, feedback e dica de E1 usam português sem alterar API", () => {
  const exercise = CENARIOS.e1.exercise;
  const result = CENARIOS.e1.results.incorrect;
  const hint = { level: 1 as const, code: "conceptual" as const, text: "Procure ameaças de mate nos próximos três plies.", highlight_squares: [] };
  const { container } = render(<ExercisePanel state={{ ...estadoInicial, exercise, validationResult: result, hint, currentHintLevel: 1 }}
    visual={factsParaVisual(result.facts)} onAction={vi.fn()} onClose={vi.fn()} onRetry={vi.fn()} onPreview={vi.fn()} onHint={vi.fn()} />);
  expect(container.textContent).toContain("três jogadas individuais");
  expect(container.textContent).toContain("perda de material");
  expect(container.textContent).toContain("ameaças de xeque-mate");
  expect(container.textContent).not.toMatch(INGLES_DA_UI);
  expect(result.facts[0].code).toBe("material_loss");
  expect(exercise.prompt).toContain("plies");
  expect(hint.text).toContain("mate");
  for (const scenario of Object.values(CENARIOS)) {
    for (const response of Object.values(scenario.results)) {
      expect(feedbackDosFacts(response.facts).join(" ")).not.toMatch(INGLES_DA_UI);
    }
  }
  expect(textoPedagogico("xeque-mate e perda material")).toBe("xeque-mate e perda de material");
});

it("peças mantêm nomes em português e concordância de cor", () => {
  expect((["k", "q", "r", "b", "n", "p"] as Tipo[]).map(tipo => rotuloDaPeca("w", tipo))).toEqual([
    "rei branco", "dama branca", "torre branca", "bispo branco", "cavalo branco", "peão branco",
  ]);
});


it("anúncios de arraste da biblioteca são apresentados em português", async () => {
  const { observarIdiomaDoTabuleiro } = await import("./acessibilidadeTabuleiro");
  const root = document.createElement("div");
  root.innerHTML = '<div id="DndDescribedBy-test">To pick up a draggable item, press the space bar.</div><div aria-roledescription="draggable"></div><div id="DndLiveRegion-test"></div>';
  const parar = observarIdiomaDoTabuleiro(root);
  expect(root.textContent).toContain("barra de espaço");
  expect(root.querySelector("[aria-roledescription]")?.getAttribute("aria-roledescription")).toBe("peça arrastável");
  const announcement = root.querySelector<HTMLElement>('[id="DndLiveRegion-test"]')!;
  for (const [original, esperado] of [
    ["Picked up draggable item e2.", "Peça e2 selecionada."],
    ["Draggable item e2 was moved over droppable area e4.", "Peça e2 movida sobre a casa e4."],
    ["Draggable item e2 is no longer over a droppable area.", "Peça e2 fora de uma casa de destino."],
    ["Draggable item e2 was dropped over droppable area e4", "Peça e2 solta sobre a casa e4."],
    ["Draggable item e2 was dropped.", "Peça e2 solta."],
    ["Dragging was cancelled. Draggable item e2 was dropped.", "Arraste cancelado. Peça e2 solta."],
  ]) {
    announcement.textContent = original;
    await waitFor(() => expect(announcement.textContent).toBe(esperado));
  }
  parar();
});
