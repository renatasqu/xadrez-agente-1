import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthContext";
import { AuthGate } from "./AuthGate";
import { authApi } from "./authApi";

vi.mock("./authApi", () => ({ authApi: { session: vi.fn(), login: vi.fn(), logout: vi.fn() } }));
vi.mock("../App", async () => {
  const { HeaderNavigation } = await import("../components/HeaderNavigation");
  return { App: ({ onLogout }: { onLogout: () => void }) => <section aria-label="Arena existente"><HeaderNavigation onExit={onLogout} /></section> };
});
const user = { name: "Owner", email: "owner@example.com" };
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  window.history.replaceState(null, "", "/#/login");
  vi.mocked(authApi.session).mockResolvedValue(null);
  vi.mocked(authApi.login).mockResolvedValue(user);
  vi.mocked(authApi.logout).mockResolvedValue({ ok: true });
});
async function start(register = false) {
  if (register) window.history.replaceState(null, "", "/#/cadastro");
  const app = render(<AuthProvider><AuthGate /></AuthProvider>);
  await screen.findByRole("heading", { name: register ? "Criar sua conta:" : "Entrar na arena:" });
  return app;
}
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
function submitLogin() {
  fill("E-mail:", user.email); fill("Senha:", "test-password-only");
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

it("ignora sessão demo forjada no armazenamento local", async () => {
  localStorage.setItem("xadrez-multiagente:demo-session:v1", JSON.stringify(user));
  window.history.replaceState(null, "", "/#/partida");
  await start();
  expect(screen.queryByRole("region", { name: "Arena existente" })).toBeNull();
  expect(localStorage.getItem("xadrez-multiagente:demo-session:v1")).toBeNull();
  await waitFor(() => expect(window.location.hash).toBe("#/login"));
});
it("navega entre login e cadastro", async () => {
  await start(); fireEvent.click(screen.getByRole("link", { name: "Criar conta" }));
  await screen.findByRole("heading", { name: "Criar sua conta:" });
  expect(screen.getByLabelText("Nome:")).toBeTruthy();
  expect(screen.getByLabelText("Confirmar senha:")).toBeTruthy();
});
it("valida obrigatórios antes de enviar credenciais", async () => {
  await start(); fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  expect(screen.getByLabelText("E-mail:").getAttribute("aria-invalid")).toBe("true");
  expect(authApi.login).not.toHaveBeenCalled();
});
it("envia senha ao backend e entra sem persistir credenciais no browser", async () => {
  await start(); submitLogin();
  await screen.findByRole("region", { name: "Arena existente" });
  expect(authApi.login).toHaveBeenCalledWith(user.email, "test-password-only");
  expect(localStorage.length).toBe(0);
  expect(window.location.hash).toBe("#/partida");
});
it("recusa senha incorreta e mostra erro", async () => {
  vi.mocked(authApi.login).mockRejectedValue(new Error("E-mail ou senha incorretos."));
  await start(); submitLogin();
  await screen.findByText("E-mail ou senha incorretos.");
  expect(screen.queryByRole("region", { name: "Arena existente" })).toBeNull();
});
it("desativa cadastro público no modo pessoal", async () => {
  await start(true);
  fill("Nome:", "Ana"); fill("E-mail:", "ana@example.com");
  fill("Senha:", "test-password-only"); fill("Confirmar senha:", "test-password-only");
  fireEvent.click(screen.getByRole("button", { name: "Criar conta" }));
  await screen.findByText(/O cadastro está desativado/);
  expect(authApi.login).not.toHaveBeenCalled();
});
it("restaura a sessão validada pelo servidor", async () => {
  vi.mocked(authApi.session).mockResolvedValue(user);
  render(<AuthProvider><AuthGate /></AuthProvider>);
  await screen.findByRole("region", { name: "Arena existente" });
  await waitFor(() => expect(window.location.hash).toBe("#/partida"));
});
it("sair revoga sessão no servidor e preserva progresso", async () => {
  localStorage.setItem("historico", "existing");
  await start(); submitLogin(); await screen.findByRole("region", { name: "Arena existente" });
  fireEvent.click(screen.getByRole("link", { name: "Sair" }));
  await screen.findByRole("heading", { name: "Entrar na arena:" });
  expect(authApi.logout).toHaveBeenCalled();
  expect(localStorage.getItem("historico")).toBe("existing");
});
it("permite mostrar e ocultar senha", async () => {
  await start(); fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
  expect(screen.getByLabelText("Senha:").getAttribute("type")).toBe("text");
  fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
  expect(screen.getByLabelText("Senha:").getAttribute("type")).toBe("password");
});
it("falha de rede mantém formulário sem abrir arena", async () => {
  vi.mocked(authApi.session).mockRejectedValue(new Error("offline"));
  vi.mocked(authApi.login).mockRejectedValue(new Error("Servidor indisponível."));
  await start(); submitLogin(); await screen.findByText("Servidor indisponível.");
  expect(screen.queryByRole("region", { name: "Arena existente" })).toBeNull();
});

it("401 privado desmonta arena, limpa UUID e retorna ao login sem reconsultas", async () => {
  const { api } = await import("../api");
  vi.mocked(authApi.session).mockResolvedValue(user);
  render(<AuthProvider><AuthGate /></AuthProvider>);
  await screen.findByRole("region", { name: "Arena existente" });
  localStorage.setItem("xadrez-agente:usuario_id", "old-id");
  const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    await api.perguntar("roque").catch(() => {});
    await screen.findByRole("heading", { name: "Entrar na arena:" });
    expect(window.location.hash).toBe("#/login");
    expect(localStorage.getItem("xadrez-agente:usuario_id")).toBeNull();
    expect(authApi.session).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(authApi.logout).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
