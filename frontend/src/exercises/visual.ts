import type { ExerciseFact, ExerciseSquare } from "../types";

export interface ExerciseVisual {
  hintSquares?: ExerciseSquare[];
  errorSquares?: ExerciseSquare[];
  sourceSquare: ExerciseSquare | null;
  destinationSquare: ExerciseSquare | null;
  highlightedSquares: ExerciseSquare[];
  dangerSquares?: ExerciseSquare[];
  blockedSquares?: ExerciseSquare[];
  attackerSquare: ExerciseSquare | null;
  targetSquares: ExerciseSquare[];
  opponentMoves: string[];
  refutationMoves: string[];
  materialDelta: number | null;
  mateSquare: ExerciseSquare | null;
}

/** Facts são evidência visual, nunca instruções para mover peças ou decidir o resultado. */
export function factsParaVisual(facts: readonly ExerciseFact[]): ExerciseVisual {
  const visual: ExerciseVisual = {
    sourceSquare: null, destinationSquare: null, highlightedSquares: [], dangerSquares: [], blockedSquares: [], attackerSquare: null,
    targetSquares: [], opponentMoves: [], refutationMoves: [], materialDelta: null, mateSquare: null,
  };
  for (const fact of facts) {
    if (!fact || typeof fact !== "object") continue;
    switch (fact.code) {
      case "legal_destination": case "illegal_move": case "straight_knight_move":
      case "invalid_knight_geometry": case "own_piece_on_destination": case "wrong_piece":
      case "leaves_king_in_check": case "wrong_source":
        visual.sourceSquare = fact.source;
        visual.destinationSquare = fact.destination;
        if (fact.code === "wrong_source") visual.highlightedSquares.push(fact.expected_source);
        break;
      case "path_occupied":
        visual.highlightedSquares.push(...fact.squares);
        visual.blockedSquares?.push(...fact.squares); break;
      case "rook_unavailable": visual.highlightedSquares.push(fact.square); break;
      case "transit_attacked": case "destination_attacked":
        visual.highlightedSquares.push(fact.square); visual.dangerSquares?.push(fact.square); break;
      case "king_in_check":
        visual.highlightedSquares.push(fact.square); visual.dangerSquares?.push(fact.square); break;
      case "fork":
        visual.attackerSquare = fact.attacker.square;
        visual.targetSquares.push(...fact.targets.map((target) => target.square));
        break;
      case "opponent_reply": visual.opponentMoves.push(fact.move); break;
      case "material_gain": visual.materialDelta = fact.net_gain; break;
      case "refutation_line":
        visual.refutationMoves.push(...fact.moves);
        visual.materialDelta = fact.net_gain;
        break;
      case "material_loss":
        visual.refutationMoves.push(...fact.moves);
        visual.materialDelta = -fact.loss;
        break;
      case "allows_mate":
        visual.mateSquare = fact.mated_king.square;
        visual.refutationMoves.push(...fact.moves);
        break;
      default: break; // Fatos sem representação e códigos futuros não quebram renderização.
    }
  }
  visual.highlightedSquares = [...new Set(visual.highlightedSquares)];
  visual.targetSquares = [...new Set(visual.targetSquares)];
  return visual;
}
