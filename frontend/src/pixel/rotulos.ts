// Nomes das peças para leitores de tela: "torre branca", "rei preto"...

export type Lado = "w" | "b";
export type Tipo = "k" | "q" | "r" | "b" | "n" | "p";

// Nome e gênero de cada peça, para concordar a cor.
const NOMES: Record<Tipo, [string, "m" | "f"]> = {
  k: ["rei", "m"],
  q: ["dama", "f"],
  r: ["torre", "f"],
  b: ["bispo", "m"],
  n: ["cavalo", "m"],
  p: ["peão", "m"],
};

export function rotuloDaPeca(lado: Lado, tipo: Tipo): string {
  const [nome, genero] = NOMES[tipo];
  const cor = lado === "w" ? (genero === "f" ? "branca" : "branco") : genero === "f" ? "preta" : "preto";
  return `${nome} ${cor}`;
}
