import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { AuthProvider } from "./AuthContext";
import { AuthGate } from "./AuthGate";
import { authApi } from "./authApi";
vi.mock("./authApi", () => ({ authApi: { session: vi.fn(), login: vi.fn(), logout: vi.fn() } }));

vi.mock("../pixel/Sprite", () => ({ Sprite: () => null }));
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

it("menu real da arena encerra a sessão sem executar o antigo reset da partida", async () => {
  vi.mocked(authApi.session).mockResolvedValue({ name: "Ana", email: "ana@example.com" });
  vi.mocked(authApi.logout).mockResolvedValue({ ok: true });
  window.history.replaceState(null, "", "/#/partida");
  vi.spyOn(api, "saude").mockResolvedValue({ status: "ok", stockfish: true, indices: {}, chave_api: true, llm_provider: "anthropic" });
  const confirm = vi.spyOn(window, "confirm");
  render(<AuthProvider><AuthGate /></AuthProvider>);
  expect(await screen.findByRole("navigation", { name: "Navegação principal" })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Sair" }));
  await screen.findByRole("heading", { name: "Entrar na arena:" });
  expect(authApi.logout).toHaveBeenCalled();
  expect(window.location.hash).toBe("#/login");
  expect(confirm).not.toHaveBeenCalled();
});
