// Gera um PNG do tabuleiro (posição de exemplo) para conferir os sprites fora do navegador.
// Uso: node scripts/previa.ts <casa_px> <saida.png>   (o Node 24 roda TypeScript direto)
// O PNG é montado aqui mesmo (zlib do Node), pixel a pixel, sem dependências.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { PALETAS, PECAS } from "../src/pixel/sprites.ts";
import { GRADES_DOS_TILES } from "../src/pixel/tiles.ts";

const casa = Number(process.argv[2] ?? 40);
const saida = process.argv[3] ?? "/tmp/previa.png";
const posicao = ["rnbqkbnr", "pppppppp", "........", "..n..B..", "...Q.k..", "........", "PPPPPPPP", "RNBQKBNR"];
const lado = casa * 8;
const rgb = new Uint8Array(lado * lado * 3);

// Mesma proporção do app: a peça ocupa 24/28 (~85%) da casa, centralizada.
const ESCALA_DA_PECA = 24 / 28; // igual a MARGEM_DA_PECA em src/pixel/PecaSprite.tsx

/** Cor "#rrggbb" ou "rgba(r,g,b,a)" -> [r, g, b, alfa]. */
function cor(texto: string): [number, number, number, number] {
  const rgba = texto.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(texto.slice(i, i + 2), 16));
  return [r, g, b, 1];
}

function pintar(grade: string[], cores: Record<string, string>, x0: number, y0: number, tamanho: number) {
  const n = grade.length;
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      const c = grade[Math.floor((y * n) / tamanho)][Math.floor((x * n) / tamanho)];
      if (c === "." || !cores[c]) continue;
      const i = ((y0 + y) * lado + (x0 + x)) * 3;
      const [r, g, b, alfa] = cor(cores[c]);
      rgb[i] = Math.round(r * alfa + rgb[i] * (1 - alfa)); // mistura (sombra semitransparente)
      rgb[i + 1] = Math.round(g * alfa + rgb[i + 1] * (1 - alfa));
      rgb[i + 2] = Math.round(b * alfa + rgb[i + 2] * (1 - alfa));
    }
  }
}

posicao.forEach((linha, fy) => {
  [...linha].forEach((p, fx) => {
    const tile = (fx + fy) % 2 === 0 ? GRADES_DOS_TILES.grama : GRADES_DOS_TILES.pedra;
    pintar(tile.grade, tile.cores, fx * casa, fy * casa, casa);
    if (p !== ".") {
      const ladoDaPeca = p === p.toUpperCase() ? "w" : "b";
      const tamanho = Math.round(casa * ESCALA_DA_PECA);
      const margem = Math.floor((casa - tamanho) / 2);
      pintar(PECAS[p.toLowerCase() as "k"], PALETAS[ladoDaPeca], fx * casa + margem, fy * casa + margem, tamanho);
    }
  });
});

// PNG: assinatura + IHDR + IDAT (linhas com filtro 0) + IEND, cada bloco com CRC32.
const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(dados: Buffer): number {
  let c = 0xffffffff;
  for (const b of dados) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(lado, 0);
ihdr.writeUInt32BE(lado, 4);
ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
const linhasPng = Buffer.alloc(lado * (lado * 3 + 1));
for (let y = 0; y < lado; y++) {
  linhasPng[y * (lado * 3 + 1)] = 0;
  linhasPng.set(rgb.subarray(y * lado * 3, (y + 1) * lado * 3), y * (lado * 3 + 1) + 1);
}
writeFileSync(
  saida,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", deflateSync(linhasPng)),
    bloco("IEND", Buffer.alloc(0)),
  ]),
);
console.log(`prévia: ${saida} (${lado}×${lado}, casas de ${casa}px)`);
