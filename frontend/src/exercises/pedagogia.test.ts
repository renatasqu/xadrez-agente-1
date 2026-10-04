import { expect, it } from "vitest";
import type { ExerciseFact } from "../types";
import { feedbackDosFacts, descricaoVisual } from "./pedagogia";
import { factsParaVisual } from "./visual";
import { passosDaRefutacao } from "./refutacao";
import { CENARIOS } from "../testes/pedagogia";

it("texto determinístico curto e seguro para fatos futuros", () => {
  expect(feedbackDosFacts([{ code: "straight_knight_move", source: "b1", destination: "b3" }])).toEqual(["O cavalo não se move em linha reta."]);
  expect(feedbackDosFacts([{ code: "future" } as unknown as ExerciseFact])).toEqual([]);
});
it("destaques têm equivalentes textuais para casas atacadas e rei em xeque", () => {
  expect(descricaoVisual(factsParaVisual([{ code: "king_in_check", square: "e1" },
    { code: "transit_attacked", square: "f1" }, { code: "destination_attacked", square: "g1" }]))).toContain("Casas destacadas: e1, f1, g1.");
});
it("refutação reproduz integralmente somente a linha enviada", () => {
  const result = CENARIOS.e1.results.incorrect;
  const steps = passosDaRefutacao(result);
  expect(steps[0].fen).toBe(result.resulting_fen);
  const fact = result.facts[0];
  expect(fact.code).toBe("material_loss");
  if (fact.code === "material_loss") {
    expect(steps).toHaveLength(fact.moves.length + 1);
    expect(steps.at(-1)?.fen).toBe(fact.resulting_fen);
  }
  expect(passosDaRefutacao(CENARIOS.e1.results.correct)).toEqual([]);
});
it("linha ilegal ou divergente não produz preview parcial", () => {
  const result = CENARIOS.e1.results.incorrect;
  const fact = result.facts[0];
  if (fact.code !== "material_loss") throw new Error("Fixture inválida");
  expect(passosDaRefutacao({ ...result, facts: [{ ...fact, moves: ["e1e8"] }] })).toEqual([]);
  expect(passosDaRefutacao({ ...result, facts: [{ ...fact, resulting_fen: CENARIOS.a1.exercise.fen }] })).toEqual([]);
});
