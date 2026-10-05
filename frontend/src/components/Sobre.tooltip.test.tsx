import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Sobre } from "./Sobre";
import { ContentModal } from "./ContentModal";

function setup() {
  const onTutor = vi.fn();
  const view = render(<ContentModal id="documentation-modal" title="DOCUMENTAÇÃO" open onClose={() => {}}>
    <Sobre section="documentation" onTutor={onTutor} />
  </ContentModal>);
  const button = screen.getByRole("button", { name: "Consultar fontes no tutor" });
  const tooltip = view.container.querySelector<HTMLElement>("#documentation-sources-tip")!;
  return { button, tooltip, onTutor };
}
function visible(tooltip: HTMLElement, value: boolean) {
  expect(getComputedStyle(tooltip).visibility).toBe(value ? "visible" : "hidden");
  expect(getComputedStyle(tooltip).opacity).toBe(value ? "1" : "0");
  expect(getComputedStyle(tooltip).pointerEvents).toBe("none");
}

it("começa oculto mesmo com o foco automático do modal", () => {
  const { button, tooltip } = setup();
  expect(document.activeElement).toBe(button);
  visible(tooltip, false);
});
it("mostra no hover do botão e oculta no mouseleave", () => {
  const { button, tooltip } = setup();
  fireEvent.mouseEnter(button);
  visible(tooltip, true);
  fireEvent.mouseLeave(button);
  visible(tooltip, false);
});
it("mostra ao receber foco de teclado dentro do modal e oculta no blur", () => {
  const { button, tooltip } = setup();
  const previous = screen.getByRole("link", { name: "Ver análises dos agentes" });
  previous.focus();
  const matches = vi.spyOn(button, "matches").mockReturnValue(true);
  fireEvent.focus(button, { relatedTarget: previous });
  visible(tooltip, true);
  fireEvent.blur(button);
  visible(tooltip, false);
  matches.mockRestore();
});
it("preserva o clique e não mantém tooltip aberto após sair", () => {
  const { button, tooltip, onTutor } = setup();
  fireEvent.mouseEnter(button);
  fireEvent.click(button);
  expect(onTutor).toHaveBeenCalledExactlyOnceWith(button);
  visible(tooltip, false);
  fireEvent.mouseLeave(button);
  fireEvent.blur(button);
  visible(tooltip, false);
});
