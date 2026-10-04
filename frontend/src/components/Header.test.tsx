import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { api } from "../api";
import { apagarUsuarioId } from "../armazenamento";
import { HeaderNavigation } from "./HeaderNavigation";

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

it("mantém branding, avatar, todos os destinos e status no header sem sidebar ou pill", async () => {
  apagarUsuarioId();
  vi.spyOn(api, "saude").mockResolvedValue({ status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" });
  const { container } = render(<App />);
  const header = within(container.querySelector(".game-header") as HTMLElement);
  expect(header.getByRole("heading", { name: "XADREZ MULTIAGENTE" })).toBeTruthy();
  expect(header.getByRole("img", { name: "XADREZ MULTIAGENTE" }).getAttribute("src")).toContain("images/logo-xadrez-multiagente.png");
  expect(header.queryByText("XADREZ")).toBeNull();
  expect(header.queryByText("MULTIAGENTE")).toBeNull();
  const nav = within(header.getByRole("navigation", { name: "Navegação principal" }));
  for (const [name, href] of [["Partida", "#partida"], ["Histórico", "#historico-partida"], ["Masters", "#agentes"], ["Sobre", "#/sobre"]]) {
    expect(nav.getByRole("link", { name }).getAttribute("href")).toBe(href);
    expect(container.querySelector(href === "#/sobre" ? "[data-page=about]" : href)).toBeTruthy();
  }
  expect(nav.getAllByRole("link").map(link => link.textContent)).toEqual(["Partida", "Histórico", "Masters", "Lições", "Sobre", "Sair"]);
  for (const name of ["Agentes", "Curiosidades", "Configurações"]) expect(nav.queryByText(name)).toBeNull();
  expect(container.querySelector(".arena-sidebar, .arena-header-tag")).toBeNull();
  expect(header.queryByText(/MAGNUS|HANS/)).toBeNull();
  expect(await header.findByText("Servidor disponível")).toBeTruthy();
  expect(header.getByText(/Latência: \d+ ms/)).toBeTruthy();
});

it("destaca a seleção e fecha o menu móvel ao navegar", () => {
  render(<HeaderNavigation />);
  const menu = screen.getByRole("button", { name: "Menu" });
  expect(menu.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(menu);
  expect(menu.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "Partida" }).getAttribute("aria-current")).toBe("location");
  fireEvent.click(screen.getByRole("link", { name: "Histórico" }));
  expect(screen.getByRole("link", { name: "Histórico" }).getAttribute("aria-current")).toBe("location");
  expect(screen.getByRole("link", { name: "Partida" }).hasAttribute("aria-current")).toBe(false);
  expect(menu.getAttribute("aria-expanded")).toBe("false");

});
