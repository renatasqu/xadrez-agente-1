import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CuriositiesCard } from "./CuriositiesCard";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const active = () => screen.getByRole("img").getAttribute("alt");

it("renderiza a primeira imagem e troca após 10 segundos", () => {
  render(<CuriositiesCard />);
  advance(9999);
  expect(active()).toBe("Curiosidade sobre Leela Chess Zero");
  advance(1);
  expect(active()).toBe("Curiosidade sobre Transformers");
});

it("volta à primeira depois da quarta sem alterar a estrutura", () => {
  const { container } = render(<CuriositiesCard />);
  const frame = container.querySelector(".curiosities-carousel");
  const images = Array.from(container.querySelectorAll("img"));
  for (const name of ["Transformers", "Judit Polgár", "Hans Niemann", "Leela Chess Zero"]) {
    advance(10000);
    expect(active()).toBe(`Curiosidade sobre ${name}`);
    expect(container.querySelectorAll('img[data-previous="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('img[data-active="true"]')).toHaveLength(1);
    expect(container.querySelector(".curiosities-carousel")).toBe(frame);
    expect(Array.from(container.querySelectorAll("img"))).toEqual(images);
  }
  expect(screen.getByRole("heading", { name: "CURIOSIDADES" })).toBeTruthy();
});

it.each(["hover", "focus"])("pausa por %s e retoma o tempo restante", method => {
  render(<CuriositiesCard />);
  const card = screen.getByRole("region", { name: "Curiosidades da partida" });
  advance(3000);
  if (method === "hover") fireEvent.mouseEnter(card); else fireEvent.focus(card);
  advance(80000);
  expect(active()).toBe("Curiosidade sobre Leela Chess Zero");
  if (method === "hover") fireEvent.mouseLeave(card); else fireEvent.blur(card);
  advance(6999);
  expect(active()).toBe("Curiosidade sobre Leela Chess Zero");
  advance(1);
  expect(active()).toBe("Curiosidade sobre Transformers");
});

it("continua pausado enquanto hover ou foco estiver ativo", () => {
  render(<CuriositiesCard />);
  const card = screen.getByRole("region", { name: "Curiosidades da partida" });
  fireEvent.mouseEnter(card);
  fireEvent.focus(card);
  fireEvent.mouseLeave(card);
  advance(10000);
  expect(active()).toBe("Curiosidade sobre Leela Chess Zero");
  fireEvent.blur(card);
  advance(10000);
  expect(active()).toBe("Curiosidade sobre Transformers");
});

it("mantém um único timer em StrictMode e limpa ao desmontar", () => {
  const view = render(<StrictMode><CuriositiesCard /></StrictMode>);
  expect(vi.getTimerCount()).toBe(1);
  view.rerender(<StrictMode><CuriositiesCard /></StrictMode>);
  expect(vi.getTimerCount()).toBe(1);
  advance(10000);
  expect(active()).toBe("Curiosidade sobre Transformers");
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("usa contain, proporção fixa e deslizamento com movimento reduzido", () => {
  const css = readFileSync("src/components/CuriositiesCard.css", "utf8");
  expect(css).toMatch(/aspect-ratio:\s*3\s*\/\s*2/);
  expect(css).toMatch(/object-fit:\s*contain/);
  expect(css).toContain("animation: curiosity-enter 400ms ease both");
  expect(css).toContain("animation: curiosity-leave 400ms ease both");
  expect(css).toContain("translateX(100%)");
  expect(css).toContain("translateX(-100%)");
  expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  expect(css).toMatch(/animation:\s*none/);
});
