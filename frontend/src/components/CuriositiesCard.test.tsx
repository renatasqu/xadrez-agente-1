import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CuriositiesCard } from "./CuriositiesCard";
import { curiosidades } from "../curiosidades";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("mostra a primeira curiosidade e avança somente após três minutos", () => {
  render(<CuriositiesCard />);
  expect(screen.getByText(curiosidades[0].texto)).toBeTruthy();
  act(() => vi.advanceTimersByTime(179999));
  expect(screen.getByText(curiosidades[0].texto)).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText(curiosidades[1].texto)).toBeTruthy();
});

it("mantém um único intervalo em StrictMode e re-render, circula e limpa ao desmontar", () => {
  const view = render(<StrictMode><CuriositiesCard /></StrictMode>);
  expect(vi.getTimerCount()).toBe(1);
  view.rerender(<StrictMode><CuriositiesCard /></StrictMode>);
  expect(vi.getTimerCount()).toBe(1);
  act(() => vi.advanceTimersByTime(180000 * curiosidades.length));
  expect(screen.getByText(curiosidades[0].texto)).toBeTruthy();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
