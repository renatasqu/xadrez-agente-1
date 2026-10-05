// Regras do tabuleiro com chess.js, separadas do componente para facilitar os testes.

import { Chess, type Square } from "chess.js";

export const FEN_INICIAL = new Chess().fen();

/** Tenta o lance; devolve o novo FEN ou null se for ilegal. Promoção explícita quando fornecida; compatibilidade padrão dama. */
export function tentarLance(fen: string, de: string, para: string, promocao: Promocao = "q"): string | null {
  const jogo = new Chess(fen);
  try {
    if (jogo.isGameOver() || !["q", "r", "b", "n"].includes(promocao)) return null;
    jogo.move({ from: de, to: para, promotion: promocao });
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

export type Promocao = "q" | "r" | "b" | "n";
export interface EstadoPartida {
  status: "playing" | "check" | "checkmate" | "stalemate" | "insufficient_material" | "repetition" | "fifty_move" | "draw";
  turn: "w" | "b";
  winner: "w" | "b" | null;
  ended: boolean;
}

/** Reconstroi lances legais, preservando a pilha exigida por repetição. */
export function jogoDoHistorico(posicoes: readonly string[]): Chess {
  if (!posicoes.length) throw new Error("Histórico vazio");
  const jogo = new Chess(posicoes[0]);
  for (const fen of posicoes.slice(1)) {
    const lance = jogo.moves({ verbose: true }).find(m => m.after === fen);
    if (!lance || jogo.isGameOver()) throw new Error("Histórico inválido");
    jogo.move(lance);
  }
  return jogo;
}

export function estadoPartida(jogo: Chess): EstadoPartida {
  const status = jogo.isCheckmate() ? "checkmate" : jogo.isStalemate() ? "stalemate"
    : jogo.isInsufficientMaterial() ? "insufficient_material" : jogo.isThreefoldRepetition() ? "repetition"
    : jogo.isDrawByFiftyMoves() ? "fifty_move" : jogo.isDraw() ? "draw" : jogo.inCheck() ? "check" : "playing";
  return { status, turn: jogo.turn(), winner: status === "checkmate" ? (jogo.turn() === "w" ? "b" : "w") : null,
    ended: status !== "playing" && status !== "check" };
}

export function textoEstado(estado: EstadoPartida): string {
  if (estado.status === "repetition") return "Empate por repetição tripla.";
  if (estado.status === "fifty_move") return "Empate pela regra dos cinquenta lances.";
  if (estado.status === "insufficient_material") return "Empate por material insuficiente.";
  if (estado.status === "stalemate") return "Afogamento: empate.";
  if (estado.winner) return `Xeque-mate! Vitória do ${estado.winner === "w" ? "Magnus" : "Hans"}.`;
  if (estado.status === "draw") return "Empate.";
  return `${estado.status === "check" ? "Xeque! " : ""}Vez do ${estado.turn === "w" ? "Magnus (brancas)" : "Hans (pretas)"}.`;
}
