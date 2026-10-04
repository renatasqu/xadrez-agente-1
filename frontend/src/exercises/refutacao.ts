import { Chess } from "chess.js";
import type { PassoDaDemo } from "../demonstracao";
import type { ValidationResult } from "../types";

/** Reproduz somente uma linha fornecida pelo backend, sem escolher lances adversários. */
export function passosDaRefutacao(result: ValidationResult | null): PassoDaDemo[] {
  const fact = result?.facts.find((f) => f.code === "material_loss" || f.code === "allows_mate" || f.code === "refutation_line");
  if (!result || !fact || !("moves" in fact) || result.status !== "incorrect") return [];
  try {
    const jogo = new Chess(result.resulting_fen);
    const passos: PassoDaDemo[] = [{ fen: jogo.fen(), de: null, para: null, san: null }];
    for (const uci of fact.moves) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return [];
      const lance = jogo.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      passos.push({ fen: jogo.fen(), de: lance.from, para: lance.to, san: lance.san });
    }
    // Nunca mostra uma linha truncada ou divergente do fato recebido.
    return jogo.fen() === new Chess(fact.resulting_fen).fen() ? passos : [];
  } catch { return []; }
}
