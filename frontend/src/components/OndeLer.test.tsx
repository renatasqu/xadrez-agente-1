import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { TrechoRecomendado } from "../types";
import { OndeLer } from "./OndeLer";

const PDF: TrechoRecomendado = {
  documento: "Laws_of_Chess-2023.pdf", titulo: "FIDE Laws of Chess (FIDE, 2023)", autor: "FIDE",
  local: "p. 1, § 3.8.2", pagina: 1, chunk_id: "laws-p1-c4",
  trecho: "3.8.2 by castling. This is a move of the king and a rook. More text.",
  frase_destaque: "This is a move of the king and a rook.", score: 0.85,
};
const TXT: TrechoRecomendado = {
  documento: "capablanca_chess_fundamentals.txt", titulo: "Chess Fundamentals (J. R. Capablanca)",
  autor: "J. R. Capablanca", local: "linhas 801-880", pagina: 11, chunk_id: "capablanca-p11-c3",
  trecho: "The control of the centre is of great importance.", frase_destaque: "The control of the centre is of great importance.",
  score: 0.84,
};

afterEach(() => vi.unstubAllGlobals());

it("mostra título, autor, local e destaca a frase-chave", () => {
  render(<OndeLer itens={[PDF, TXT]} />);
  expect(screen.getByText("FIDE Laws of Chess (FIDE, 2023)")).toBeTruthy();
  expect(screen.getByText("– J. R. Capablanca")).toBeTruthy();
  const marcas = document.querySelectorAll("mark");
  expect(marcas[0].textContent).toBe("This is a move of the king and a rook.");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("PDF abre em outra aba na página certa, sem dar acesso à janela", () => {
  render(<OndeLer itens={[PDF]} />);
  const link = screen.getByRole("link", { name: /Ver no documento/ });
  expect(link.getAttribute("href")).toMatch(/\/documentos\/Laws_of_Chess-2023\.pdf#page=1$/);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toContain("noopener");
});

it("TXT abre o trecho com os parágrafos em volta e fecha com Esc", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    expect(url).toContain("/documentos/capablanca_chess_fundamentals.txt/contexto?chunk_id=capablanca-p11-c3");
    return new Response(JSON.stringify({
      documento: TXT.documento, titulo: TXT.titulo, autor: TXT.autor, local: TXT.local,
      antes: ["Parágrafo de antes."], trecho: TXT.trecho, depois: ["Parágrafo de depois."],
    }));
  }));
  render(<OndeLer itens={[TXT]} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver no documento" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(await screen.findByText("Parágrafo de antes.")).toBeTruthy();
  expect(screen.getByText("Parágrafo de depois.")).toBeTruthy();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("erro ao abrir o trecho mostra o .resposta do backend", async () => {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ resposta: "Não encontrei esse endereço ou documento.", fontes: [], agente: "roteador", confianca: 0 }), { status: 404 }),
  ));
  render(<OndeLer itens={[TXT]} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver no documento" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Não encontrei esse endereço ou documento.");
});

it("sem trechos não mostra nada", () => {
  const { container } = render(<OndeLer itens={[]} />);
  expect(container.innerHTML).toBe("");
});
