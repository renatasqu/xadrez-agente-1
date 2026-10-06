import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { api } from "../api";
import { apagarUsuarioId } from "../armazenamento";
import { HeaderNavigation } from "./HeaderNavigation";

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

async function followLink(name: string) {
  const navigated = new Promise<void>(resolve => window.addEventListener("hashchange", () => resolve(), { once: true }));
  await act(async () => { fireEvent.click(screen.getByRole("link", { name })); await navigated; });
}

it("mantém branding, avatar, todos os destinos e status no header sem sidebar ou pill", async () => {
  apagarUsuarioId();
  vi.spyOn(api, "saude").mockResolvedValue({ status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" });
  const { container } = (window.history.replaceState(null, "", "#explorar"), render(<App />));
  const header = within(container.querySelector(".game-header") as HTMLElement);
  expect(header.getByRole("heading", { name: "XADREZ MULTIAGENTE" })).toBeTruthy();
  expect(header.getByRole("img", { name: "XADREZ MULTIAGENTE" }).getAttribute("src")).toContain("images/logo-xadrez-multiagente.png");
  expect(header.queryByText("XADREZ")).toBeNull();
  expect(header.queryByText("MULTIAGENTE")).toBeNull();
  const nav = within(header.getByRole("navigation", { name: "Navegação principal" }));
  for (const [name, href] of [["Partida", "#/partida"], ["Histórico", "#/historico"], ["Masters", "#/masters"], ["Sobre", "#/sobre"]]) {
    expect(nav.getByRole("link", { name }).getAttribute("href")).toBe(href);
    expect(container.querySelector(href === "#/sobre" ? "[data-page=about]" : href === "#/masters" ? "[data-page=masters]" : href === "#/historico" ? "[data-page=history]" : "#partida")).toBeTruthy();
  }
  expect(nav.getAllByRole("link").map(link => link.textContent)).toEqual(["Partida", "Histórico", "Masters", "Lições", "Sobre", "Sair"]);
  for (const name of ["Agentes", "Curiosidades", "Configurações"]) expect(nav.queryByText(name)).toBeNull();
  expect(container.querySelector(".arena-sidebar, .arena-header-tag")).toBeNull();
  expect(header.queryByText(/MAGNUS|HANS/)).toBeNull();
  expect(await header.findByText("Servidor disponível")).toBeTruthy();
  expect(header.getByText(/Latência: \d+ ms/)).toBeTruthy();
});

it("destaca a seleção e fecha o menu móvel ao navegar", async () => {
  render(<HeaderNavigation />);
  const menu = screen.getByRole("button", { name: "Menu" });
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(menu);
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "Partida" }).getAttribute("aria-current")).toBe("location");
  await followLink("Histórico");
  expect(window.location.hash).toBe("#/historico");
  expect(screen.getByRole("link", { name: "Histórico" }).getAttribute("aria-current")).toBe("location");
  expect(screen.getByRole("link", { name: "Partida" }).hasAttribute("aria-current")).toBe(false);
  expect(menu.getAttribute("aria-expanded")).toBe("false");

});


it("abre Masters na ordem indicada e conserva o tabuleiro ao voltar", async () => {
  apagarUsuarioId();
  vi.spyOn(api, "saude").mockResolvedValue({ status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" });
  const { container } = (window.history.replaceState(null, "", "#explorar"), render(<App />));
  const board = container.querySelector("#match-board");
  await followLink("Masters");
  const gallery = await screen.findByRole("region", { name: "MASTERS:" });
  expect(window.location.hash).toBe("#/masters");
  expect(within(gallery).getAllByRole("article").map(profile => profile.getAttribute("aria-labelledby"))).toEqual(["master-hans", "master-magnus", "master-judit"]);
  expect(within(gallery).getAllByRole("img")).toHaveLength(3);
  expect(within(gallery).getAllByRole("heading", { name: "VOCÊ SABIA?" })).toHaveLength(3);
  expect(within(gallery).queryByRole("button")).toBeNull();
  expect(container.querySelector("#partida")?.hasAttribute("hidden")).toBe(true);
  await followLink("Partida");
  await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar partida contra IA" })).toBeTruthy());
  expect(window.location.hash).toBe("#/partida");
  expect(container.querySelector("#partida")?.hasAttribute("hidden")).toBe(true);
  expect(container.querySelector("#match-board")).toBe(board);
});
