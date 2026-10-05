import { it, expect } from "vitest";
import { Chess } from "chess.js";
import { FEN_INICIAL, tentarLance, jogoDoHistorico, estadoPartida } from "./lances";
it("repetição real, snapshot, desfazer e reiniciar", () => {
  const jogo = new Chess(); const snapshots = [jogo.fen()];
  for (const move of ["Nf3","Nf6","Ng1","Ng8","Nf3","Nf6","Ng1","Ng8"]) { jogo.move(move); snapshots.push(jogo.fen()); }
  expect(estadoPartida(jogoDoHistorico(snapshots)).status).toBe("repetition");
  expect(estadoPartida(new Chess(snapshots.at(-1)!)).ended).toBe(false);
  expect(estadoPartida(jogoDoHistorico(snapshots.slice(0,-1))).ended).toBe(false);
  expect(estadoPartida(jogoDoHistorico([FEN_INICIAL])).status).toBe("playing");
});
it.each(["q","r","b","n"] as const)("promoção %s", piece => {
  const fen = tentarLance("7k/P7/8/8/8/8/8/7K w - - 0 1","a7","a8",piece)!;
  expect(new Chess(fen).get("a8")?.type).toBe(piece);
});
it("ilegal e lado errado", () => {
  expect(tentarLance(FEN_INICIAL,"e7","e5")).toBeNull();
  expect(tentarLance(FEN_INICIAL,"e2","e5")).toBeNull();
});
it.each([
  ["7k/6Q1/6K1/8/8/8/8/8 b - - 0 1","checkmate"],
  ["7k/5Q2/6K1/8/8/8/8/8 b - - 0 1","stalemate"],
  ["7k/8/8/8/8/8/8/K7 w - - 0 1","insufficient_material"],
  ["7k/8/8/8/8/8/R7/K7 w - - 100 51","fifty_move"],
  ["7k/7R/8/8/8/8/8/K7 b - - 0 1","check"],
])("estado %s", (fen,status) => expect(estadoPartida(new Chess(fen)).status).toBe(status));
