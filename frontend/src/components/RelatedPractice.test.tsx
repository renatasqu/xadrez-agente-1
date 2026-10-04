import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RelatedPractice } from "./RelatedPractice";

it("CTA de prática tem nome acessível e abre somente o exercício indicado", () => {
  const practice = vi.fn();
  render(<RelatedPractice ids={["A1", "A1"]} onPractice={practice} />);
  const buttons = screen.getAllByRole("button", { name: /Praticar este conceito/ });
  expect(buttons).toHaveLength(1);
  fireEvent.click(buttons[0]);
  expect(practice).toHaveBeenCalledWith("A1");
});
