import { expect, it } from "vitest";
import type { ExerciseFact } from "../types";
import { factsParaVisual } from "./visual";
it("fork destaca atacante e alvos", () => {
  expect(factsParaVisual([{ code: "fork", attacker: { square: "c7", piece: "knight", color: "white" },
    square: "c7", targets: [{ square: "a8", piece: "rook", color: "black" }, { square: "e8", piece: "king", color: "black" }],
    gives_check: true, fen: "fen" }])).toMatchObject({ attackerSquare: "c7", targetSquares: ["a8", "e8"] });
});
it("path_occupied destaca casas sem repetição", () => {
  expect(factsParaVisual([{ code: "path_occupied", squares: ["f1", "g1"] }, { code: "transit_attacked", square: "f1" }]).highlightedSquares).toEqual(["f1", "g1"]);
});
it("material_loss preserva linha e sinal negativo", () => {
  expect(factsParaVisual([{ code: "material_loss", initial_balance: 0, final_balance: -3, loss: 3,
    max_material_loss: 0, moves: ["e1f2", "c8c3", "f2e1"], resulting_fen: "fen" }])).toMatchObject({
    materialDelta: -3, refutationMoves: ["e1f2", "c8c3", "f2e1"],
  });
});
it("allows_mate aponta rei e linha sem modificar FEN", () => {
  expect(factsParaVisual([{ code: "allows_mate", mated_king: { square: "g1", piece: "king", color: "white" },
    mate_in_opponent_moves: 1, moves: ["a1a2", "a8a1"], resulting_fen: "fen" }])).toMatchObject({ mateSquare: "g1", refutationMoves: ["a1a2", "a8a1"] });
});
it("straight_knight_move preserva origem e destino da tentativa", () => {
  expect(factsParaVisual([{ code: "straight_knight_move", source: "b1", destination: "b3" }])).toMatchObject({ sourceSquare: "b1", destinationSquare: "b3" });
});
it("fatos sem representação e códigos desconhecidos são seguros", () => {
  expect(factsParaVisual([{ code: "castling_right_absent", side: "kingside" }])).toEqual(factsParaVisual([]));
  expect(factsParaVisual([{ code: "future_fact" } as unknown as ExerciseFact])).toEqual(factsParaVisual([]));
});
it("opponent_reply é metadado, separado de refutação", () => {
  expect(factsParaVisual([{ code: "opponent_reply", move: "e8d7", policy: "material_minimax_v1" }])).toMatchObject({ opponentMoves: ["e8d7"], refutationMoves: [] });
});
it("material_gain e refutation_line preservam valores autoritativos", () => {
  expect(factsParaVisual([{ code: "material_gain", initial_balance: 0, final_balance: 5, net_gain: 5, required_gain: 3, fen: "fen" }]).materialDelta).toBe(5);
  expect(factsParaVisual([{ code: "refutation_line", reason: "attacker_lost", moves: ["b5c7", "c8c7"],
    resulting_fen: "fen", net_gain: -3, required_gain: 3 }])).toMatchObject({ materialDelta: -3, refutationMoves: ["b5c7", "c8c7"] });
});
