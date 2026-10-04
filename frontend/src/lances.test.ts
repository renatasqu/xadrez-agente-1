import { expect, it } from "vitest";
import { FEN_INICIAL, destinosLegais, situacao, tentarLance } from "./lances";

it("aceita lance legal e recusa ilegal", () => {
  expect(tentarLance(FEN_INICIAL, "e2", "e4")).toContain("4P3");
  expect(tentarLance(FEN_INICIAL, "e2", "e5")).toBeNull();
  expect(tentarLance(FEN_INICIAL, "e7", "e5")).toBeNull(); // não é a vez das pretas
});

it("promove a dama automaticamente", () => {
  const fen = "8/P6k/8/8/8/8/8/K7 w - - 0 1";
  expect(tentarLance(fen, "a7", "a8")?.startsWith("Q7")).toBe(true);
});

it("lista os destinos do cavalo", () => {
  expect(destinosLegais(FEN_INICIAL, "g1").sort()).toEqual(["f3", "h3"]);
});

it("descreve a situação com os nomes dos lados", () => {
  expect(situacao(FEN_INICIAL)).toBe("Vez do Magnus (brancas).");
  const mate = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
  expect(situacao(mate)).toBe("Xeque-mate! Vitória do Hans.");
});
