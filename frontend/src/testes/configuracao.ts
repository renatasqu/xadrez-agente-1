// Configuração dos testes (jsdom não tem algumas APIs do navegador).
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverFalso as unknown as typeof ResizeObserver;

// jsdom não tem layout: a animação do react-chessboard mede as casas e falharia. Os testes
// rodam como "movimento reduzido" (o mesmo caminho de quem pede isso no sistema).
if (!window.matchMedia) {
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes("prefers-reduced-motion"),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
