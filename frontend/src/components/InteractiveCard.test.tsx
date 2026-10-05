import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InteractiveCard } from "./InteractiveCard";

afterEach(cleanup);

it("preserva ação e descrição existentes e permite dispensar o tooltip por Escape", () => {
  const click = vi.fn();
  render(<InteractiveCard action="Abrir tutor" aria-describedby="context" onClick={click}>Tutor</InteractiveCard>);
  const card = screen.getByRole("button", { name: "Tutor" });
  fireEvent.pointerEnter(card);
  const tooltip = screen.getByRole("tooltip");
  expect(card.getAttribute("aria-describedby")).toBe(`context ${tooltip.id}`);
  expect(tooltip.parentElement).toBe(document.body);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(card.getAttribute("aria-describedby")).toBe("context");
  fireEvent.click(card);
  expect(click).toHaveBeenCalledOnce();
});

it("oferece tooltip no foco visível e o remove ao sair", () => {
  render(<InteractiveCard action="Abrir lições">Lições</InteractiveCard>);
  const card = screen.getByRole("button");
  const matches = vi.spyOn(card, "matches").mockReturnValue(true);
  fireEvent.focus(card);
  expect(screen.getByRole("tooltip").textContent).toBe("Abrir lições");
  fireEvent.blur(card);
  expect(screen.queryByRole("tooltip")).toBeNull();
  matches.mockReturnValue(false);
  fireEvent.focus(card);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("não anuncia ações indisponíveis", () => {
  render(<InteractiveCard action="Abrir exercício" disabled>Praticar</InteractiveCard>);
  fireEvent.pointerEnter(screen.getByRole("button"));
  expect(screen.queryByRole("tooltip")).toBeNull();
});
