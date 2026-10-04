import type { ExerciseFact } from "../types";
import type { ExerciseVisual } from "./visual";

export const EXERCISE_LABELS: Record<string, { conceito: string; nome: string }> = {
  "a1-cavalo": { conceito: "Movimento do cavalo", nome: "Movimento do cavalo" },
  "a2-roque-pequeno": { conceito: "Roque", nome: "Roque pequeno" },
  "a2-roque-grande": { conceito: "Roque", nome: "Roque grande" },
  "a2-roque-bloqueado": { conceito: "Roque", nome: "Roque bloqueado" },
  "a3-garfo-cavalo": { conceito: "Garfo", nome: "Garfo de cavalo" },
  "e1-material-seguro": { conceito: "Evitar perda de material", nome: "Segurança material" },
};
const FACT_TEXT: Record<ExerciseFact["code"], string> = {
  legal_destination: "O lance é legal.",
  illegal_move: "Esse lance não é legal nesta posição.",
  straight_knight_move: "O cavalo não se move em linha reta.",
  invalid_knight_geometry: "O cavalo se move em L: duas casas e uma para o lado.",
  own_piece_on_destination: "Essa casa está ocupada por uma peça sua.",
  wrong_source: "Use a peça indicada na instrução do exercício.",
  wrong_piece: "Escolha uma peça sua para jogar.",
  leaves_king_in_check: "Esse lance deixa seu rei em xeque.",
  castling_right_absent: "O direito de rocar desse lado não está disponível.",
  rook_unavailable: "A torre necessária para o roque não está disponível.",
  path_occupied: "Há peças bloqueando o caminho do roque.",
  king_in_check: "Não é possível rocar enquanto o rei está em xeque.",
  transit_attacked: "O rei não pode atravessar uma casa atacada ao rocar.",
  destination_attacked: "O rei não pode terminar o roque em uma casa atacada.",
  fork: "O cavalo está atacando dois ou mais alvos ao mesmo tempo.",
  opponent_reply: "A resposta adversária já foi aplicada pelo servidor.",
  material_gain: "O objetivo de ganho material foi alcançado neste exercício.",
  refutation_line: "Essa tentativa não atinge o objetivo. Veja a sequência enviada pelo servidor.",
  material_loss: "Esse lance permite uma perda de material.",
  allows_mate: "Esse lance permite xeque-mate imediato.",
};
export function feedbackDosFacts(facts: readonly ExerciseFact[]): string[] {
  return [...new Set(facts.flatMap((fact) => FACT_TEXT[fact?.code] ? [FACT_TEXT[fact.code]] : []))];
}
export function descricaoVisual(visual: ExerciseVisual): string[] {
  const linhas: string[] = [];
  if (visual.sourceSquare) linhas.push(`Origem da tentativa: ${visual.sourceSquare}.`);
  if (visual.destinationSquare) linhas.push(`Destino da tentativa: ${visual.destinationSquare}.`);
  if (visual.highlightedSquares.length) linhas.push(`Casas destacadas: ${visual.highlightedSquares.join(", ")}.`);
  if (visual.attackerSquare) linhas.push(`Atacante: ${visual.attackerSquare}.`);
  if (visual.targetSquares.length) linhas.push(`Alvos: ${visual.targetSquares.join(", ")}.`);
  if (visual.mateSquare) linhas.push(`Rei em xeque-mate na refutação: ${visual.mateSquare}.`);
  if (visual.hintSquares?.length) linhas.push(`Casas da dica: ${visual.hintSquares.join(", ")}.`);
  return linhas;
}
