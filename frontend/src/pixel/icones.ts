// Ícones pequenos (8×8) em pixel art, feitos para este projeto.

import type { Grade, Paleta } from "./sprites";

export const ICONE_LIVRO: { grade: Grade; paleta: Paleta } = {
  grade: ["........", ".oooooo.", ".oppppo.", ".oplllo.", ".oppppo.", ".oplllo.", ".oooooo.", "........"],
  paleta: { o: "#4a2f1a", p: "#f1e3c2", l: "#b99a6b" },
};

export const ICONE_MOTOR: { grade: Grade; paleta: Paleta } = {
  grade: ["....yy..", "...yy...", "..yy....", ".yyyyy..", "...yy...", "..yy....", ".yy.....", "........"],
  paleta: { y: "#ffd23f" },
};

// Um ícone por agente (a cor muda; o formato ajuda a distinguir sem depender só da cor).
const FORMAS: Record<string, Grade> = {
  apito: ["........", "..oooo..", ".o....o.", ".o....oo", ".o....o.", "..oooo..", "........", "........"],
  livro: ICONE_LIVRO.grade,
  espada: ["......o.", ".....oo.", "....oo..", "...oo...", ".ooo....", "..o.....", ".o.o....", "........"],
  raio: ICONE_MOTOR.grade,
  seta: ["........", "...o....", "....o...", "oooooo..", "....o...", "...o....", "........", "........"],
};

export const ICONES_DOS_AGENTES: Record<string, { grade: Grade; paleta: Paleta }> = {
  arbitro: { grade: FORMAS.apito, paleta: { o: "#1d3552" } },
  professor: ICONE_LIVRO,
  estrategista: { grade: FORMAS.espada, paleta: { o: "#7a1f1f" } },
  analista: { grade: FORMAS.raio, paleta: { y: "#c98a00" } },
  roteador: { grade: FORMAS.seta, paleta: { o: "#3b3f4a" } },
};
