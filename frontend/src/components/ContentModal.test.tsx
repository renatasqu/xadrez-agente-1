import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { ContentModal } from "./ContentModal";

function Example() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Abrir tutor</button><ContentModal id="example" title="SEU TUTOR" open={open} onClose={() => setOpen(false)}>
    <textarea aria-label="Rascunho" /><button>Última ação</button>
  </ContentModal></>;
}

it("abre, bloqueia scroll, fecha por Escape e devolve foco sem perder rascunho", () => {
  render(<Example />);
  const opener = screen.getByRole("button", { name: "Abrir tutor" });
  opener.focus(); fireEvent.click(opener);
  expect(screen.getByRole("dialog", { name: "SEU TUTOR" })).toBeTruthy();
  expect(document.body.style.overflow).toBe("hidden");
  const draft = screen.getByRole("textbox", { name: "Rascunho" });
  expect(document.activeElement).toBe(draft);
  fireEvent.change(draft, { target: { value: "Como funciona o roque?" } });
  fireEvent.keyDown(draft, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(document.activeElement).toBe(opener);
  fireEvent.click(opener);
  expect((screen.getByRole("textbox", { name: "Rascunho" }) as HTMLTextAreaElement).value).toBe("Como funciona o roque?");
  fireEvent.click(screen.getByRole("button", { name: "Fechar seu tutor" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("mantém Tab e Shift+Tab dentro da janela", () => {
  render(<Example />);
  fireEvent.click(screen.getByRole("button", { name: "Abrir tutor" }));
  const first = screen.getByRole("button", { name: "Fechar seu tutor" });
  const last = screen.getByRole("button", { name: "Última ação" });
  last.focus(); fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);
  first.focus(); fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
});

it("devolve foco ao gatilho atual quando o layout o reposiciona durante o modal", () => {
  const original = document.createElement("button");
  document.body.appendChild(original);
  const opener = { current: original };
  const view = render(<ContentModal id="relocated" title="LIÇÕES" open onClose={() => {}} returnFocusRef={opener}><button>Ação</button></ContentModal>);
  const replacement = document.createElement("button");
  document.body.appendChild(replacement);
  original.remove();
  opener.current = replacement;
  view.rerender(<ContentModal id="relocated" title="LIÇÕES" open={false} onClose={() => {}} returnFocusRef={opener}><button>Ação</button></ContentModal>);
  expect(document.activeElement).toBe(replacement);
  view.unmount(); replacement.remove();
});
