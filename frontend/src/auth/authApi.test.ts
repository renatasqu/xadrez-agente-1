import { afterEach, expect, it, vi } from "vitest";
import { authApi } from "./authApi";

afterEach(() => vi.unstubAllGlobals());
it("login, sessão e logout enviam credentials sem token no JavaScript", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("null")));
  await authApi.session(); await authApi.login("a@example.com", "password"); await authApi.logout();
  for (const [, options] of vi.mocked(fetch).mock.calls) expect(options?.credentials).toBe("include");
});
