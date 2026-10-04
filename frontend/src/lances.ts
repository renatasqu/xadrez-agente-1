// Regras do tabuleiro com chess.js, separadas do componente para facilitar os testes.

import { Chess, type Square } from "chess.js";

export const FEN_INICIAL = new Chess().fen();

/** Tenta o lance; devolve o novo FEN ou null se for ilegal. Promoção vira dama. */
export function tentarLance(fen: string, de: string, para: string): string | null {
  const jogo = new Chess(fen);
  try {
    jogo.move({ from: de, to: para, promotion: "q" });
  } catch {
    return null; // chess.js lança erro em lance ilegal
  }
  return jogo.fen();
}

/** Casas para onde a peça em `casa` pode ir (vazio se não houver peça do lado que joga). */
export function destinosLegais(fen: string, casa: string): string[] {
  const jogo = new Chess(fen);
  return jogo.moves({ square: casa as Square, verbose: true }).map((m) => m.to);
}

/** Texto do estado da partida, com os nomes dos dois lados. */
export function situacao(fen: string): string {
  const jogo = new Chess(fen);
  const vez = jogo.turn() === "w" ? "Magnus (brancas)" : "Hans (pretas)";
  if (jogo.isCheckmate()) {
    const vencedor = jogo.turn() === "w" ? "Hans" : "Magnus";
    return `Xeque-mate! Vitória do ${vencedor}.`;
  }
  if (jogo.isStalemate()) return "Afogamento: empate.";
  if (jogo.isDraw()) return "Empate.";
  if (jogo.inCheck()) return `Xeque! Vez do ${vez}.`;
  return `Vez do ${vez}.`;
}

/** Lado da peça que está na casa, se houver: "w" ou "b". */
export function ladoDaPeca(fen: string, casa: string): "w" | "b" | null {
  return new Chess(fen).get(casa as Square)?.color ?? null;
}

/** Lado que joga no FEN. */
export function vezDe(fen: string): "w" | "b" {
  return new Chess(fen).turn();
}
