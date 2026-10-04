import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api } from "./api";
import { apagarUsuarioId } from "./armazenamento";

vi.mock("./pixel/Sprite", () => ({ Sprite: ({ rotulo }: { rotulo: string }) => <span role={rotulo ? "img" : undefined} aria-label={rotulo || undefined} /> }));

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });
function start() {
  apagarUsuarioId();
  vi.spyOn(api, "saude").mockResolvedValue({ status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" });
  return render(<App />);
}

it("estrutura separa faixas, tabuleiro, análises e controles sem conteúdo aberto", () => {
  const { container } = start();
  expect(container.querySelector(".match-upper-strip > .agent-headers")).toBeTruthy();
  expect(container.querySelector(".match-upper-strip > #historico-partida")).toBeTruthy();
  expect(container.querySelector(".match-context-strip")).toBeTruthy();
  expect(container.querySelector(".match-context-strip")?.hasAttribute("hidden")).toBe(true);
  expect(screen.queryByText("Explore uma posição")).toBeTruthy();
  expect(screen.queryByLabelText("Contexto do tabuleiro")?.closest("[hidden]")).toBeTruthy();
  expect(container.querySelector(".match-game-column > #match-board")).toBeTruthy();
  expect(container.querySelector(".match-sidebar > .arena-reasoning")).toBeTruthy();
  expect(container.querySelector(".match-lower-strip > .arena-control-strip")).toBeTruthy();
  const column = container.querySelector(".match-game-column")!;
  expect(column.contains(container.querySelector("#match-board"))).toBe(true);
  expect(column.contains(container.querySelector(".arena-control-strip"))).toBe(true);
  expect(column.querySelectorAll(".match-controls button")).toHaveLength(7);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("tutor mantém conversa, rascunho e opções ao fechar e reabrir", async () => {
  start();
  vi.spyOn(api, "perguntar").mockResolvedValue({ agente: "professor", resposta: "O rei se move uma casa.", fontes: [], confianca: 0 });
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  const tutor = within(screen.getByRole("dialog", { name: "SEU TUTOR" }));
  fireEvent.change(tutor.getByRole("textbox"), { target: { value: "Como joga o rei?" } });
  fireEvent.click(tutor.getByRole("button", { name: "Enviar" }));
  expect(await tutor.findByText("O rei se move uma casa.")).toBeTruthy();
  fireEvent.change(tutor.getByRole("textbox"), { target: { value: "E o roque?" } });
  fireEvent.click(tutor.getByRole("checkbox", { name: "Anexar posição do tabuleiro" }));
  fireEvent.keyDown(tutor.getByRole("textbox"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^CHAME TUTOR/ }));
  expect((tutor.getByRole("textbox") as HTMLTextAreaElement).value).toBe("E o roque?");
  expect((tutor.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(tutor.getByText("O rei se move uma casa.")).toBeTruthy();
});

it("lições mantêm texto, fontes, progresso e navegação no próprio modal", async () => {
  start();
  vi.spyOn(api, "proximaLicao").mockResolvedValue({ usuario_id: "lesson-user", concluido: false,
    licao: { numero: 1, total: 12, modulo: "regras", titulo: "O rei" },
    conteudo: { agente: "professor", resposta: "O rei se move uma casa.", fontes: [{ documento: "fide", titulo: "FIDE", local: "Artigo 3", trecho: "Movimento do rei" }], confianca: 1 },
  });
  fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  const lessons = within(screen.getByRole("dialog", { name: "LIÇÕES" }));
  fireEvent.click(lessons.getByRole("button", { name: "Começar lições" }));
  expect(await lessons.findByText("O rei se move uma casa.")).toBeTruthy();
  expect(lessons.getByRole("button", { name: "Próxima lição" })).toBeTruthy();
  expect(lessons.getByText(/Lição 1\/12/)).toBeTruthy();
  expect(lessons.getByText(/FIDE/)).toBeTruthy();
  fireEvent.click(lessons.getByRole("button", { name: "Fechar lições" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^LIÇÕES/ }));
  await waitFor(() => expect(lessons.getByText("O rei se move uma casa.")).toBeTruthy());
});

it("troca de lições para tutor e devolve foco ao gatilho original ao fechar", () => {
  start();
  const opener = screen.getByRole("button", { name: /^LIÇÕES/ });
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole("button", { name: "Abrir conversa do tutor" }));
  expect(screen.getByRole("dialog", { name: "SEU TUTOR" })).toBeTruthy();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe("");
});

it("novas entradas abrem páginas próprias e preservam rascunho e like ao reabrir", async () => {
  start();
  fireEvent.click(screen.getByRole("link", { name: "Lições" }));
  expect(await screen.findByRole("region", { name: "Lições de xadrez" })).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  window.history.replaceState(null, "", "#/curiosidades");
  fireEvent(window, new Event("hashchange"));
  expect(await screen.findByRole("region", { name: "Curiosidades" })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Partida" }));
  await waitFor(() => expect(screen.getByRole("button", { name: /^DEIXE SEU COMENTÁRIO/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /^DEIXE SEU COMENTÁRIO/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Seu comentário" }), { target: { value: "Gostei!" } });
  fireEvent.click(screen.getByRole("button", { name: "Like" }));
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: /^DEIXE SEU COMENTÁRIO/ }));
  expect((screen.getByRole("textbox", { name: "Seu comentário" }) as HTMLTextAreaElement).value).toBe("Gostei!");
  expect(screen.getByRole("button", { name: "Like" }).getAttribute("aria-pressed")).toBe("true");
});

it("atalhos flutuantes mantêm Tutor e Lições inclusive na página de lições", async () => {
  start();
  fireEvent.click(screen.getByRole("button", { name: "Abrir tutor" }));
  expect(screen.getByRole("dialog", { name: "SEU TUTOR" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("link", { name: "Lições" }));
  expect(await screen.findByRole("region", { name: "Lições de xadrez" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Abrir lições" }));
  const dialog = within(screen.getByRole("dialog", { name: "LIÇÕES" }));
  expect(dialog.getByRole("button", { name: "Começar lições" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(within(screen.getByRole("region", { name: "Lições de xadrez" })).getByRole("button", { name: "Começar lições" })).toBeTruthy();
});

it("Sobre e Documentação preservam conteúdo sob demanda, fecham e devolvem foco", () => {
  const { container } = start();
  expect(container.querySelector('.arena-shell .game-footer')).toBeNull();
  const sidebar = container.querySelector(".match-sidebar") as HTMLElement;
  expect(within(sidebar).getByRole("button", { name: "SOBRE O PROJETO" })).toBeTruthy();
  expect(within(sidebar).getByRole("button", { name: "DOCUMENTAÇÃO" })).toBeTruthy();
  expect(sidebar.lastElementChild?.id).toBe("sobre-projeto");
  expect(container.querySelectorAll(".project-access")).toHaveLength(1);
  const about = screen.getByRole("button", { name: "SOBRE O PROJETO" });
  fireEvent.click(about);
  const content = within(screen.getByRole("dialog", { name: "SOBRE O PROJETO" }));
  fireEvent.click(content.getByText("Documentos da biblioteca"));
  for (const title of ["FIDE Laws of Chess", "Chess Fundamentals", "The Blue Book of Chess", "Ten Steps to Learn Chess Tactics and Combinations"]) expect(content.getByText(title)).toBeTruthy();
  expect(content.getByText(/Nenhum dado pessoal é coletado/)).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(about);
  fireEvent.click(about);
  fireEvent.click(screen.getByRole("button", { name: "Fechar sobre o projeto" }));
  const documentation = screen.getByRole("button", { name: "DOCUMENTAÇÃO" });
  fireEvent.click(documentation);
  const docs = within(screen.getByRole("dialog", { name: "DOCUMENTAÇÃO" }));
  expect(docs.getByText(/As fontes citadas e os trechos dos documentos estão disponíveis no tutor/)).toBeTruthy();
  expect(docs.getByRole("link", { name: "Ver análises dos agentes" })).toBeTruthy();
  expect(docs.getByRole("button", { name: "Consultar fontes no tutor" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(documentation);
  fireEvent.click(documentation);
  fireEvent.click(screen.getByRole("button", { name: "Fechar documentação" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("menu Sobre abre o modal e permite reabrir no mesmo destino", async () => {
  start();
  const link = screen.getByRole("link", { name: "Sobre" });
  fireEvent.click(link);
  expect(await screen.findByRole("dialog", { name: "SOBRE O PROJETO" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(link);
  expect(screen.getByRole("dialog", { name: "SOBRE O PROJETO" })).toBeTruthy();
});
