import { expect, it } from "vitest";
import { passosDaDemo, sanEmPortugues } from "./demonstracao";

const INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

it("passo 0 é a posição inicial e cada passo tem as casas do lance", () => {
  const passos = passosDaDemo(INICIAL, ["e4", "e5", "Nf3"]);
  expect(passos).toHaveLength(4);
  expect(passos[0]).toMatchObject({ fen: INICIAL, de: null, para: null });
  expect(passos[3]).toMatchObject({ de: "g1", para: "f3", san: "Nf3" });
});

it("roque destaca a casa de saída e a de chegada do rei", () => {
  const [, roque] = passosDaDemo("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", ["O-O"]);
  expect(roque).toMatchObject({ de: "e1", para: "g1", san: "O-O" });
});

it("para no primeiro lance ilegal", () => {
  expect(passosDaDemo(INICIAL, ["e4", "e4", "Nf3"])).toHaveLength(2);
});

it("FEN inválido não gera passos", () => {
  expect(passosDaDemo("isto não é FEN", ["e4"])).toEqual([]);
});

it("SAN em português", () => {
  expect(sanEmPortugues("Nf3")).toBe("Cf3");
  expect(sanEmPortugues("Qxf7#")).toBe("Dxf7#");
  expect(sanEmPortugues("O-O")).toBe("O-O");
});
