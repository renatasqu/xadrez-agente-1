import { afterEach, expect, it, vi } from "vitest";
import { apagarUsuarioId, gravarUsuarioId, lerUsuarioId } from "./armazenamento";

afterEach(() => {
  vi.restoreAllMocks();
  apagarUsuarioId();
});

it("guarda e lê o id no localStorage", () => {
  gravarUsuarioId("abc");
  expect(window.localStorage.getItem("xadrez-agente:usuario_id")).toBe("abc");
  expect(lerUsuarioId()).toBe("abc");
});

it("funciona na memória quando o localStorage lança erro", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
  expect(() => gravarUsuarioId("xyz")).not.toThrow();
  expect(lerUsuarioId()).toBe("xyz");
});
