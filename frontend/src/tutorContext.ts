/** Official positions are resolved by the server; study FENs describe the displayed board. */
export type TutorPositionContext =
  | { source: "game"; game_id: string }
  | { source: "replay"; game_id: string; ply: number }
  | { source: "exercise" | "exploration"; fen: string };

export function tutorContextLabel(context: TutorPositionContext | null): string {
  if (!context) return "Pergunta sem posição";
  if (context.source === "game") return "Posição atual da partida";
  if (context.source === "replay") return `Revisão · ply ${context.ply}`;
  return context.source === "exercise" ? "Exercício" : "Posição de estudo";
}
