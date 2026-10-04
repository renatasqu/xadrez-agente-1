// Espelho dos modelos Pydantic do backend (backend/schemas.py).

export type NomeAgente = "arbitro" | "professor" | "estrategista" | "analista" | "roteador";

export interface Fonte {
  documento: string; // arquivo em backend/docs, ou "stockfish"
  titulo: string;
  local: string;
  trecho: string;
}

// Trecho do bloco "Onde ler": ordem da busca, frase-chave escolhida pelo backend.
export interface TrechoRecomendado {
  documento: string;
  titulo: string;
  autor: string;
  local: string;
  pagina: number;
  chunk_id: string;
  trecho: string;
  frase_destaque: string; // parte exata de `trecho`
  score: number;
}

// Lances para ver no tabuleiro (curados no backend ou linha do Stockfish; nunca do LLM).
export interface Demonstracao {
  fen_inicial: string;
  lances: string[]; // SAN
  descricao: string;
}

export interface Resposta {
  resposta: string;
  fontes: Fonte[];
  agente: NomeAgente;
  confianca: number;
  onde_ler?: TrechoRecomendado[]; // opcional: respostas antigas (cache de lições) não têm
  demonstracao?: Demonstracao | null;
  concept_ids?: string[];
  related_exercise_ids?: string[];
}

export interface ContextoDoTrecho {
  documento: string;
  titulo: string;
  autor: string;
  local: string;
  antes: string[];
  trecho: string;
  depois: string[];
}

export interface Saude {
  status: "ok" | "degradado";
  stockfish: boolean;
  indices: Record<string, number>;
  chave_api: boolean;
  llm_provider: string;
}

export interface InfoLicao {
  numero: number;
  total: number;
  modulo: string;
  titulo: string;
}

export interface RespostaLicao {
  usuario_id: string;
  concluido: boolean;
  licao: InfoLicao | null;
  conteudo: Resposta | null;
  concept_ids?: string[];
  related_exercise_ids?: string[];
}

// Espelho de backend/exercises/models.py. FEN, UCI e limites são validados no servidor.
export type ExerciseSquare = `${"a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type ExerciseSide = "kingside" | "queenside";
export interface ExercisePieceRef {
  square: ExerciseSquare;
  piece: "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
  color: "white" | "black";
}
export type ExerciseGoal =
  | { type: "reach_legal_square"; piece: ExercisePieceRef & { piece: "knight" } }
  | { type: "answer_position_question"; question: "can_castle"; side: ExerciseSide }
  | { type: "knight_fork_gain"; piece: ExercisePieceRef & { piece: "knight" }; min_material_gain: number;
      max_student_moves: 2; opponent_policy: "material_minimax_v1" }
  | { type: "avoid_material_loss"; max_material_loss: number; horizon_plies: 3; opponent_policy: "bounded_safety_v1" };
export interface Exercise {
  id: string;
  version: number;
  prompt: string;
  fen: string;
  goal: ExerciseGoal;
}
export type ExerciseAction =
  | { type: "move"; source: ExerciseSquare; destination: ExerciseSquare }
  | { type: "answer"; answer: boolean };
export interface ValidationRequest {
  version: number;
  action: ExerciseAction;
  history?: string[]; // UCI, máximo quatro plies; sempre do último resultado canônico.
}
export type ExerciseHint = (
  | { level: 1; code: "conceptual" }
  | { level: 2; code: "piece_or_region" }
  | { level: 3; code: "specific_squares" }
) & { highlight_squares: ExerciseSquare[]; text: string | null };

type ExerciseMoveFact = { source: ExerciseSquare; destination: ExerciseSquare };
export type ExerciseFact =
  | (ExerciseMoveFact & { code: "legal_destination" })
  | (ExerciseMoveFact & { code: "illegal_move" })
  | (ExerciseMoveFact & { code: "straight_knight_move" })
  | (ExerciseMoveFact & { code: "invalid_knight_geometry" })
  | (ExerciseMoveFact & { code: "own_piece_on_destination" })
  | (ExerciseMoveFact & { code: "wrong_source"; expected_source: ExerciseSquare })
  | (ExerciseMoveFact & { code: "wrong_piece" })
  | (ExerciseMoveFact & { code: "leaves_king_in_check" })
  | { code: "castling_right_absent"; side: ExerciseSide }
  | { code: "rook_unavailable"; square: ExerciseSquare }
  | { code: "path_occupied"; squares: ExerciseSquare[] }
  | { code: "king_in_check"; square: ExerciseSquare }
  | { code: "transit_attacked"; square: ExerciseSquare }
  | { code: "destination_attacked"; square: ExerciseSquare }
  | { code: "fork"; attacker: ExercisePieceRef; square: ExerciseSquare; targets: ExercisePieceRef[];
      gives_check: boolean; fen: string }
  | { code: "opponent_reply"; move: string; policy: "material_minimax_v1" }
  | { code: "material_gain"; initial_balance: number; final_balance: number; net_gain: number;
      required_gain: number; fen: string }
  | { code: "refutation_line"; reason: "no_fork" | "attacker_lost" | "target_not_converted" | "insufficient_gain" | "terminal_failure";
      moves: string[]; resulting_fen: string; net_gain: number; required_gain: number }
  | { code: "material_loss"; initial_balance: number; final_balance: number; loss: number;
      max_material_loss: number; moves: string[]; resulting_fen: string }
  | { code: "allows_mate"; mated_king: ExercisePieceRef & { piece: "king" }; mate_in_opponent_moves: 1;
      moves: string[]; resulting_fen: string };
export interface ValidationResult {
  status: "correct" | "incorrect" | "partial";
  resulting_fen: string;
  facts: ExerciseFact[];
  next_hint: ExerciseHint | null;
  history: string[];
}
export interface ExerciseError {
  code: "exercise_not_found" | "version_mismatch" | "invalid_history" | "invalid_action" |
    "incompatible_action" | "invalid_request" | "internal_error";
  message: string;
}
export interface ExerciseProgress {
  exercise_id: string;
  concept_id: string;
  status: "in_progress" | "completed";
  attempts: number;
  updated_at: string;
}
