import type { Exercise, ValidationResult } from "../types";
export const A1: Exercise = {
  id: "a1-cavalo", version: 1, prompt: "Mova o cavalo de b1 para qualquer casa legal.",
  fen: "4k3/8/8/8/8/8/8/1N2K3 w - - 0 1",
  goal: { type: "reach_legal_square", piece: { square: "b1", piece: "knight", color: "white" } },
};
export const A3: Exercise = {
  id: "a3-garfo-cavalo", version: 1, prompt: "Crie um garfo.",
  fen: "r3k3/8/8/1N3r2/8/8/8/4K2R w - - 0 1",
  goal: { type: "knight_fork_gain", piece: { square: "b5", piece: "knight", color: "white" },
    min_material_gain: 3, max_student_moves: 2, opponent_policy: "material_minimax_v1" },
};
export const PARTIAL: ValidationResult = {
  status: "partial", resulting_fen: "r7/2Nk4/8/5r2/8/8/8/4K2R w - - 2 2",
  history: ["b5c7", "e8d7"], facts: [
    { code: "fork", attacker: { square: "c7", piece: "knight", color: "white" }, square: "c7",
      targets: [{ square: "a8", piece: "rook", color: "black" }, { square: "e8", piece: "king", color: "black" }],
      gives_check: true, fen: "r3k3/2N5/8/5r2/8/8/8/4K2R b - - 1 1" },
    { code: "opponent_reply", move: "e8d7", policy: "material_minimax_v1" },
  ], next_hint: null,
};
