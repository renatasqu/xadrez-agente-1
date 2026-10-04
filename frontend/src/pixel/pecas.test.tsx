import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PECAS_DO_TABULEIRO, rotuloDaPeca } from "./pecas";
import { AVATARES, PALETAS, PECAS } from "./sprites";

it.each([
  ["w", "r", "torre branca"],
  ["b", "q", "dama preta"],
  ["w", "k", "rei branco"],
  ["b", "n", "cavalo preto"],
  ["w", "b", "bispo branco"],
  ["b", "p", "peão preto"],
] as const)("%s%s tem o rótulo %s", (lado, tipo, rotulo) => {
  expect(rotuloDaPeca(lado, tipo)).toBe(rotulo);
});

it("as 12 peças do tabuleiro têm aria-label", () => {
  expect(Object.keys(PECAS_DO_TABULEIRO)).toHaveLength(12);
  render(<div>{Object.values(PECAS_DO_TABULEIRO).map((Peca, i) => <span key={i}>{Peca()}</span>)}</div>);
  expect(screen.getByRole("img", { name: "torre branca" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "dama preta" })).toBeTruthy();
  expect(screen.getAllByRole("img")).toHaveLength(12);
});

const luminancia = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

it("peças têm 24×24, avatares 16×16, e as seis silhuetas são diferentes", () => {
  for (const grade of Object.values(PECAS)) {
    expect(grade).toHaveLength(24);
    for (const linha of grade) expect(linha).toHaveLength(24);
  }
  for (const { grade } of Object.values(AVATARES)) {
    expect(grade).toHaveLength(16);
    for (const linha of grade) expect(linha).toHaveLength(16);
  }
  expect(new Set(Object.values(PECAS).map((g) => g.join())).size).toBe(6);
});

it("bonequinhos têm brilho nos olhos, bochechas, pedestal e sombra", () => {
  for (const [tipo, grade] of Object.entries(PECAS)) {
    const pixels = grade.join("");
    if (tipo !== "n") {
      expect(pixels).toContain("w"); // brilho de 1 pixel no olho
      expect(pixels).toContain("p"); // bochecha rosada
    }
    expect(grade.slice(18, 22).join("")).toContain("b"); // pedestal
    expect(grade.slice(22).join("")).toMatch(/^[.d]+$/); // só sombra embaixo do pedestal
    expect(grade.slice(22).join("")).toContain("d");
  }
});

it("a cabeça ocupa cerca de 45% da altura", () => {
  // Da primeira linha do que vai na cabeça até o queixo (linha 13).
  for (const tipo of ["k", "q", "r", "b", "p"] as const) {
    const topo = PECAS[tipo].findIndex((linha) => linha !== ".".repeat(24));
    const alturaDaCabeca = 14 - Math.max(topo, 3);
    expect(alturaDaCabeca / 24).toBeGreaterThanOrEqual(0.44);
  }
});

it("o contorno é o tom escuro da paleta, não preto", () => {
  expect(luminancia(PALETAS.w.o)).toBeGreaterThan(30);
  expect(luminancia(PALETAS.b.o)).toBeGreaterThan(30);
});

it("lado branco é claro e lado preto é escuro (não só a cor muda)", () => {
  expect(luminancia(PALETAS.w.f)).toBeGreaterThan(200);
  expect(luminancia(PALETAS.b.f)).toBeLessThan(60);
  expect(luminancia(PALETAS.w.b)).toBeGreaterThan(luminancia(PALETAS.b.b) + 100); // pedestal também
});
