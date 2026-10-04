import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Resposta } from "../types";
import { RespostaDoAgente } from "./Mensagem";

const resposta: Resposta = {
  resposta: "O melhor lance é **Nc7+**.",
  agente: "analista",
  confianca: 0.7,
  fontes: [
    { documento: "stockfish", titulo: "Stockfish (motor de xadrez)", local: "análise de 1 s", trecho: "Melhor lance: Nc7+" },
    { documento: "regis_tactics.pdf", titulo: "Ten Steps (D. Regis)", local: "p. 14", trecho: "A fork is..." },
  ],
};

it("mostra agente, confiança e texto com negrito", () => {
  render(<RespostaDoAgente resposta={resposta} />);
  expect(screen.getByText("Analista")).toBeTruthy();
  expect(screen.getByLabelText("confiança 70%")).toBeTruthy();
  expect(screen.getByText("Nc7+").tagName).toBe("STRONG");
});

it("fontes são etiquetas que expandem o trecho", () => {
  render(<RespostaDoAgente resposta={resposta} />);
  const livro = screen.getByRole("button", { name: /Ten Steps/ });
  expect(screen.queryByText("A fork is...")).toBeNull();
  fireEvent.click(livro);
  expect(livro.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("A fork is...")).toBeTruthy();
  fireEvent.click(livro);
  expect(screen.queryByText("A fork is...")).toBeNull();
});

it("a fonte do Stockfish tem visual diferente dos livros", () => {
  render(<RespostaDoAgente resposta={resposta} />);
  const motor = screen.getByRole("button", { name: /Motor: Stockfish/ });
  const livro = screen.getByRole("button", { name: /Ten Steps/ });
  expect(motor.dataset.tipo).toBe("motor");
  expect(livro.dataset.tipo).toBe("livro");
  expect(motor.className).not.toBe(livro.className);
});

it("resposta sem fonte (recusa ou erro) não mostra confiança", () => {
  render(<RespostaDoAgente resposta={{ resposta: "Muitas perguntas.", fontes: [], agente: "roteador", confianca: 0 }} erro />);
  expect(screen.getByText("Muitas perguntas.")).toBeTruthy();
  expect(screen.queryByText(/confiança/)).toBeNull();
  expect(screen.getByText("erro")).toBeTruthy();
});
