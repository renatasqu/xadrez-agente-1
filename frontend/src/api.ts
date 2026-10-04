import type { HintRequest, HintResponse } from "./types";
// Todas as chamadas ao backend. A URL vem de VITE_API_URL (ver .env.example).
//
// Rotas legadas e progresso usam Resposta nos erros. /exercises usa code/message.

import { lerUsuarioId } from "./armazenamento";
import type { Exercise, ExerciseError, ExerciseProgress, ValidationRequest, ValidationResult, ContextoDoTrecho, Resposta, RespostaLicao, Saude } from "./types";

export const URL_DA_API = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

// Um pouco acima do timeout do backend (30 s): se a rede travar, o usuário não espera para sempre.
export const TEMPO_MAXIMO_MS = 35_000;

export const MSG_SEM_SERVIDOR = "Não consegui falar com o servidor. Ele está ligado?";
export const MSG_TEMPO_ESGOTADO = "O servidor demorou demais para responder. Tente de novo.";

/** Erro de uma chamada: `mensagem` já está pronta para mostrar ao usuário. */
export class ErroDaApi extends Error {
  readonly status: number;
  readonly resposta: Resposta;

  constructor(mensagem: string, status: number, resposta?: Resposta) {
    super(mensagem);
    this.status = status;
    this.resposta = resposta ?? { resposta: mensagem, fontes: [], agente: "roteador", confianca: 0 };
  }
}

function ehResposta(corpo: unknown): corpo is Resposta {
  return typeof corpo === "object" && corpo !== null && typeof (corpo as Resposta).resposta === "string";
}

/** Erro operacional de exercício; nunca se converte em resposta de agente ou incorrect. */
export class ErroDeExercicio extends Error {
  constructor(readonly erro: ExerciseError, readonly status: number) {
    super(erro.message);
  }
}

function ehErroDeExercicio(corpo: unknown): corpo is ExerciseError {
  if (typeof corpo !== "object" || corpo === null || !("code" in corpo) || !("message" in corpo)) return false;
  return typeof corpo.message === "string" && typeof corpo.code === "string" && ["exercise_not_found", "version_mismatch", "invalid_history",
    "invalid_action", "incompatible_action", "invalid_request", "internal_error"].includes(corpo.code);
}

function erroOperacional(mensagem: string, status: number, exercicio: boolean): Error {
  return exercicio ? new ErroDeExercicio({ code: "internal_error", message: mensagem }, status)
    : new ErroDaApi(mensagem, status);
}

async function chamar<T>(caminho: string, opcoes: RequestInit = {}, exercicio = false): Promise<T> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_MAXIMO_MS);
  let resposta: Response;
  try {
    resposta = await fetch(URL_DA_API + caminho, {
      ...opcoes,
      headers: { "Content-Type": "application/json", ...opcoes.headers },
      signal: controle.signal,
    });
  } catch {
    throw erroOperacional(controle.signal.aborted ? MSG_TEMPO_ESGOTADO : MSG_SEM_SERVIDOR, 0, exercicio);
  } finally {
    clearTimeout(relogio);
  }

  let corpo: unknown = null;
  try {
    corpo = await resposta.json();
  } catch {
    // corpo vazio ou que não é JSON: tratado abaixo
  }
  if (!resposta.ok) {
    if (exercicio && ehErroDeExercicio(corpo)) throw new ErroDeExercicio(corpo, resposta.status);
    if (!exercicio && ehResposta(corpo)) throw new ErroDaApi(corpo.resposta, resposta.status, corpo);
    throw erroOperacional(`Erro ${resposta.status} no servidor. Tente de novo.`, resposta.status, exercicio);
  }
  return corpo as T;
}

const post = (corpo: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(corpo) });

export const api = {
  dicaExercicio: (id: string, payload: HintRequest) =>
    chamar<HintResponse>(`/exercises/${encodeURIComponent(id)}/hint`, post(payload), true),
  exercicio: (id: string) => chamar<Exercise>(`/exercises/${encodeURIComponent(id)}`, {}, true),
  validarExercicio: (id: string, payload: ValidationRequest) => {
    const usuarioId = lerUsuarioId();
    const query = usuarioId ? `?usuario_id=${encodeURIComponent(usuarioId)}` : "";
    return chamar<ValidationResult>(`/exercises/${encodeURIComponent(id)}/validate${query}`, post(payload), true);
  },
  // O endpoint real de progresso usa ErroDaApi (Resposta), fora do namespace /exercises.
  progressoExercicios: (usuarioId: string) =>
    chamar<ExerciseProgress[]>(`/progresso/exercicios?usuario_id=${encodeURIComponent(usuarioId)}`),
  saude: () => chamar<Saude>("/health"),
  perguntar: (mensagem: string, fen?: string) => chamar<Resposta>("/chat", post({ mensagem, fen: fen ?? null })),
  analisar: (fen: string) => chamar<Resposta>("/analisar", post({ fen })),
  proximaLicao: (usuarioId: string | null) =>
    chamar<RespostaLicao>("/licao/proxima", post({ usuario_id: usuarioId })),
  licaoAtual: (usuarioId: string) =>
    chamar<RespostaLicao>(`/licao/atual?usuario_id=${encodeURIComponent(usuarioId)}`),
  recomendar: (mensagem: string) => chamar<Resposta>("/recomendar", post({ mensagem })),
  contexto: (documento: string, chunkId: string) =>
    chamar<ContextoDoTrecho>(
      `/documentos/${encodeURIComponent(documento)}/contexto?chunk_id=${encodeURIComponent(chunkId)}`,
    ),
};

/** Endereço do arquivo no backend; PDFs abrem na página certa (#page= do leitor de PDF). */
export function urlDoDocumento(documento: string, pagina?: number): string {
  const base = `${URL_DA_API}/documentos/${encodeURIComponent(documento)}`;
  return documento.toLowerCase().endsWith(".pdf") && pagina ? `${base}#page=${pagina}` : base;
}
