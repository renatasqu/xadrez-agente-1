// Passos de uma demonstração no tabuleiro (chess.js). O backend já validou os lances; aqui
// validamos de novo e paramos no primeiro que não for legal.

import { Chess } from "chess.js";

export interface PassoDaDemo {
  fen: string;
  de: string | null; // casa de saída do lance que levou a esta posição
  para: string | null; // casa de chegada
  san: string | null;
}

/** Passo 0 é a posição inicial; o passo i é a posição depois do i-ésimo lance. */
export function passosDaDemo(fenInicial: string, lances: string[]): PassoDaDemo[] {
  let jogo: Chess;
  try {
    jogo = new Chess(fenInicial);
  } catch {
    return [];
  }
  const passos: PassoDaDemo[] = [{ fen: jogo.fen(), de: null, para: null, san: null }];
  for (const lance of lances) {
    try {
      const feito = jogo.move(lance);
      passos.push({ fen: jogo.fen(), de: feito.from, para: feito.to, san: feito.san });
    } catch {
      break;
    }
  }
  return passos;
}

// Letras das peças em SAN: inglês -> português (rei, dama, torre, bispo, cavalo).
const PECAS: Record<string, string> = { K: "R", Q: "D", R: "T", B: "B", N: "C" };

export function sanEmPortugues(san: string): string {
  return [...san].map((c) => PECAS[c] ?? c).join("");
}
