// Sprites em pixel art, desenhados para este projeto.
//
// Peças (24×24): bonequinhos chibi de coleção. Cabeça grande e redonda (~45% da altura), olhos
// com um pixel de brilho, bochechas rosadas, pedestal arredondado e sombra. A silhueta clássica
// fica no que cada um usa na cabeça: coroa com cruz (rei), coroa de pontas (dama), elmo com
// ameias (torre), mitra com fenda (bispo), capacete de soldado (peão); o cavalo é uma cabeça de
// cavalo no mesmo pedestal. Personagens inventados e genéricos: cabelo de geada no lado do
// gelo e em chamas no lado do fogo, sem copiar a aparência de ninguém.
//
// Cada caractere é um pixel:
//   .  transparente    o  contorno (tom escuro da paleta)    f  roupa/corpo
//   l  luz             s  sombra        a  detalhe (coroa, elmo, mitra)   y  brilho (cruz, joias)
//   k  pele            e  olho          w  brilho do olho (branco)        p  bochecha rosada
//   m  boca            h  cabelo/crina  b  pedestal   B  sombra do pedestal
//   d  sombra no chão (semitransparente)                g  olho do cavalo
// Linhas com metade do tamanho são espelhadas (peças simétricas): no espelho, "l" vira "s",
// então a luz fica à esquerda e a sombra à direita. Linhas inteiras ficam como estão.
//
// Este arquivo não importa nada: o script de prévia (scripts/previa.ts) o usa direto no Node.

export type Grade = string[];
export type Paleta = Record<string, string>;

const ESPELHO: Record<string, string> = { l: "s", s: "l" };

/** Expande as linhas de meia largura (espelhando) e confere o tamanho de cada linha. */
export function montar(linhas: string[], lado = 24): Grade {
  if (linhas.length !== lado) throw new Error(`sprite com ${linhas.length} linhas (esperado ${lado})`);
  return linhas.map((linha) => {
    if (linha.length === lado) return linha;
    if (linha.length !== lado / 2) throw new Error(`linha com ${linha.length} caracteres: "${linha}"`);
    const direita = [...linha].reverse().map((c) => ESPELHO[c] ?? c).join("");
    return linha + direita;
  });
}

// Partes comuns (meia largura). Linhas 8 a 13: rosto; 18 a 23: pedestal e sombra.
const ROSTO = [
  "...ohkkkkkkk",
  "...ohkwekkkk",
  "...ohkeekkkk",
  "...okpkkkkkm",
  "....okkkkkkk",
  ".....ooooooo",
];
const PEDESTAL = [
  "....oooooooo",
  "...obbbbbbbb",
  "...oBBBBBBBB",
  "....oooooooo",
  ".....ddddddd",
  ".......ddddd",
];

export const PECAS: Record<"k" | "q" | "r" | "b" | "n" | "p", Grade> = {
  // Rei: coroa com cruz e joias, capa com barra.
  k: montar([
    "..........oy",
    ".........oyy",
    "......o.o.oy",
    ".....oaoaoay",
    ".....oaaaaaa",
    ".....oayaaaa",
    "....oooooooo",
    "...ohhhhhhhh",
    ...ROSTO,
    ".....oafffff",
    "....oalfffff",
    "....oalfffff",
    "....oaffffff",
    ...PEDESTAL,
  ]),
  // Dama: coroa de pontas com joias e cabelo comprido caindo dos lados.
  q: montar([
    "....y...y..y",
    "....o...o..o",
    "....oo.oao.o",
    ".....oaaaaoa",
    ".....oayaaaa",
    "....oooooooo",
    "...ohhhhhhhh",
    "..ohhhhhhhhh",
    "..ohhkkkkkkk",
    "..ohhkwekkkk",
    "..ohhkeekkkk",
    "..ohhpkkkkkm",
    "..ohhhokkkkk",
    "..ohhhoooooo",
    "..ohh.offfff",
    "...oo.olffaf",
    ".....olfffaf",
    ".....offffff",
    ...PEDESTAL,
  ]),
  // Torre: elmo com três ameias.
  r: montar([
    "....oooo..oo",
    "....oaao..oa",
    "....oaaooooa",
    "...oaaaaaaaa",
    "...oayaaaaaa",
    "...oaaaaaaaa",
    "...oaaaaaaaa",
    "...ooooooooo",
    ...ROSTO,
    "....offfffff",
    "....olffffff",
    "....oaaaaaaa",
    "....olffffff",
    ...PEDESTAL,
  ]),
  // Bispo: mitra pontuda com a fenda diagonal clássica (linhas inteiras: a fenda não é
  // simétrica). Sem cruz, para não confundir com o rei em casas pequenas.
  b: montar([
    "..........oooo..........",
    ".........oaaaao.........",
    "........oaaaaoao........",
    ".......oaaaaoaaao.......",
    "......oaaaaoaaaaao......",
    ".....oaaaaaaaaaaaao.....",
    "....oaaaaaaaaaaaaaao....",
    "....oooooooooooooooo....",
    ...ROSTO,
    ".....offfffa",
    "....olffffaa",
    "....olfffffa",
    "....offffffa",
    ...PEDESTAL,
  ]),
  // Cavalo: cabeça de perfil com crina e olho grande, no mesmo pedestal.
  n: montar([
    "........................",
    "...........o...o........",
    "..........ofo.ofo.......",
    ".........offfoffffoo....",
    "........offfffffffhho...",
    ".......offgwfffffhhhho..",
    "......offfggfffffhhhho..",
    ".....offffffffffffhhho..",
    "....offffffffffffhhhho..",
    "...offfffffffffffhhhho..",
    "..offffffooffffffhhho...",
    "..opfffffo.offfffhhho...",
    "..ooooooo..offfffhhho...",
    "..........offfffhhhho...",
    ".........offffffhhho....",
    "........offffffffho.....",
    ".......offfffffffo......",
    "......oaaaaaaaaaaaao....",
    ...PEDESTAL,
  ]),
  // Peão: soldadinho de capacete redondo, mais baixo e estreito que as outras peças.
  p: montar([
    "............",
    "............",
    "............",
    "......oooooo",
    "....ooaaaaaa",
    "...oaayaaaaa",
    "...oaaaaaaaa",
    "...ooooooooo",
    ...ROSTO,
    "......offfff",
    "......olffff",
    ".....oaaaaaa",
    "......olffff",
    ...PEDESTAL,
  ]),
};

// Um lado claro e um escuro (a cor não é a única diferença: a roupa, "f", também é clara ou
// escura). O contorno é o tom escuro de cada paleta, mais suave que preto.
export const PALETAS: Record<"w" | "b", Paleta> = {
  // Magnus (brancas, lado do gelo): roupa clara, contorno azul, coroas e elmos azul-gelo,
  // cabelo de geada.
  w: {
    o: "#2f5d8a", f: "#f2f8ff", l: "#ffffff", s: "#c3dbf2", a: "#4f9be0", y: "#8fdcff",
    k: "#ffdcc2", e: "#23405f", w: "#ffffff", p: "#ff9fb4", m: "#c9607a", h: "#cde5ff",
    b: "#9fd2f7", B: "#6fb1e6", d: "rgba(10,20,40,0.28)", g: "#23405f",
  },
  // Hans (pretas, lado do fogo): roupa e pedestal escuros, contorno vinho; o fogo fica nos
  // detalhes (cabelo e crina em chamas, joias e cruz douradas).
  b: {
    o: "#5c1a12", f: "#2e1210", l: "#4a1d17", s: "#1c0907", a: "#b3261e", y: "#ffcf3f",
    k: "#f0c09a", e: "#2a0d08", w: "#ffffff", p: "#ff8a8a", m: "#a8343a", h: "#ff7a2e",
    b: "#5a1a14", B: "#3d110d", d: "rgba(20,5,0,0.30)", g: "#ffcf3f",
  },
};

// Avatares dos dois lados (personagens inventados para este projeto).
export const AVATARES: Record<"gelo" | "fogo", { grade: Grade; paleta: Paleta }> = {
  // Magnus: coroa de cristais, rosto claro, barba branca, manto azul.
  gelo: {
    grade: montar([
      "..a...a.",
      "..a..aaa",
      "..aaaaaa",
      "..oooooo",
      "..offfff",
      "..ofefff",
      "..offfff",
      "..owwfff",
      "..owwwww",
      "...owwww",
      "..obbbbb",
      ".obbbbbb",
      ".obbbbbb",
      "obbbbbbb",
      "obbbbbbb",
      "oooooooo",
    ], 16),
    paleta: {
      a: "#7fd3ff", o: "#1d3552", f: "#f3d9c4", e: "#1d3552", w: "#ffffff",
      b: "#4f7fb8", l: "#f3d9c4", s: "#f3d9c4",
    },
  },
  // Hans: capuz escuro, cabelo em chamas, olhos brilhando.
  fogo: {
    grade: montar([
      "...a..a.",
      "..aya.ay",
      "..ayyaay",
      "..oooooo",
      ".occcccc",
      ".occffff",
      ".ocfefff",
      ".ocfffff",
      ".occffff",
      ".occcccc",
      "..occccc",
      ".orrrrrr",
      ".orrrrrr",
      "orrrrrrr",
      "orrrrrrr",
      "oooooooo",
    ], 16),
    paleta: {
      a: "#ff5a1f", y: "#ffd23f", o: "#2a0a0a", c: "#4a1414", f: "#d9a07a", e: "#ffd23f",
      r: "#c0392b", l: "#d9a07a", s: "#d9a07a",
    },
  },
};

/** SVG (texto) de uma grade: um <rect> por pixel, sem suavização. */
export function svgDaGrade(grade: Grade, paleta: Paleta, tamanho = 16, rotulo = ""): string {
  const rects: string[] = [];
  grade.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      const cor = paleta[c];
      if (c !== "." && cor) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${cor}"/>`);
    });
  });
  const titulo = rotulo ? `<title>${rotulo}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${tamanho}" height="${tamanho}" ` +
    `shape-rendering="crispEdges">${titulo}${rects.join("")}</svg>`
  );
}
