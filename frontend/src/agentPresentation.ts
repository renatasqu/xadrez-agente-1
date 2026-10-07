import type { AgentProfile } from "./types";
export const difficultyLabels = { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" };
export const styleLabels = { balanced: "equilibrado", aggressive: "agressivo", positional: "posicional", tactical: "tático" };
/** Valida somente metadados públicos; não define perfis nem políticas. */
export function safeProfiles(data: unknown): AgentProfile[] {
  return Array.isArray(data) ? data.filter(p => p && typeof p.id === "string" && /^[a-z_]{1,64}$/.test(p.id)
    && typeof p.display_name === "string" && typeof p.description === "string"
    && Object.hasOwn(difficultyLabels, p.difficulty) && Object.hasOwn(styleLabels, p.style)) : [];
}
export type ProfileRequest = { id: string; sequence: number };
