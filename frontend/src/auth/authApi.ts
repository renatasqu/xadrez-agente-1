import { URL_DA_API } from "../api";
export type SessionUser = { name: string; email: string };

async function request<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${URL_DA_API}/auth/${path}`, {
      method: body ? "POST" : "GET", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error("Não consegui falar com o servidor. Ele está ligado?"); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.resposta ?? data.detail ?? "Não foi possível entrar. Tente novamente.");
  return data as T;
}

export const authApi = {
  session: () => request<SessionUser | null>("session"),
  login: (email: string, password: string) => request<SessionUser>("login", { email, password }),
  logout: () => request<{ ok: boolean }>("logout", {}),
};
