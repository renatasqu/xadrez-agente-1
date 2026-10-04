// Ladrilhos 8×8 em pixel art (genéricos, feitos para este projeto): grama nas casas claras e
// pedra nas escuras. São usados como fundo das casas (data URI) e na prévia.

const GRAMA = { g: "#9ccc65", G: "#8bbd52", h: "#b5dc7d" };
const PEDRA = { p: "#6f757d", P: "#5f656c", q: "#848a92" };

const GRADE_GRAMA = [
  "gggGgggg",
  "ghgggggG",
  "ggggGggg",
  "Ggggghgg",
  "gggggggg",
  "ggGgggGg",
  "hggggggg",
  "gggGghgg",
];
const GRADE_PEDRA = [
  "qqqPqqqq",
  "pppPpppp",
  "pppPpppp",
  "PPPPPPPP",
  "qqqqqqqP",
  "pppppppP",
  "pppppppP",
  "PPPPPPPP",
];

export const GRADES_DOS_TILES = { grama: { grade: GRADE_GRAMA, cores: GRAMA }, pedra: { grade: GRADE_PEDRA, cores: PEDRA } };

function tile(grade: string[], cores: Record<string, string>): string {
  const rects = grade.flatMap((linha, y) =>
    [...linha].map((c, x) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${cores[c]}"/>`),
  );
  return rects.join("");
}

export const TILE_GRAMA = tile(GRADE_GRAMA, GRAMA);
export const TILE_PEDRA = tile(GRADE_PEDRA, PEDRA);

/** Fundo CSS de uma casa (SVG 8×8 esticado, sem suavização). */
export function fundoDoTile(conteudo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">${conteudo}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
