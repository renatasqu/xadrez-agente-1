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

export interface DadosDoMotor {
  fen: string;
  lado: "brancas" | "pretas";
  perspectiva: "white";
  tipo_avaliacao: "centipawn" | "mate" | null;
  pontos: number | null;
  mate: number | null;
  melhor_lance: string | null; // SAN inglês
  melhor_lance_uci: string | null;
  linha: string[]; // até três plies, em SAN inglês
  linha_uci: string[];
  profundidade: number | null;
  status: "ongoing" | "checkmate" | "stalemate" | "insufficient_material";
  vencedor: "white" | "black" | null; // desambigua mate=0 em posição terminal
  fim_de_jogo: string | null;
  caracteristicas: string[];
}
export interface EstadoAnalise {
  status: "available" | "invalid_position" | "engine_error";
  dados: DadosDoMotor | null;
  explicacao_status: "available" | "unavailable" | "not_applicable";
  explicacao_erro: "llm_error" | "retrieval_error" | "explanation_unavailable" | "explanation_timeout" | null;
}

export interface Resposta {
  resposta: string;
  analise?: EstadoAnalise | null; // aditivo; respostas antigas continuam válidas
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

export interface HintRequest {
  version: number;
  history: string[];
  last_action: ExerciseAction | null;
  current_hint_level: 0 | 1 | 2 | 3;
}
export interface HintResponse { next_hint: ExerciseHint | null }

// Partidas contra IA: servidor é autoridade; modo manual permanece independente.
export type GameColor = "white" | "black";
export interface Game {
  id: string;
  initial_fen: string;
  current_fen: string;
  moves: string[]; // UCI canônico, em ordem
  human_color: GameColor;
  side_to_move: GameColor;
  status: "playing" | "check" | "checkmate" | "stalemate" | "insufficient_material" | "repetition" | "fifty_move" | "draw";
  winner: GameColor | null;
  terminal: boolean;
  awaiting_agent: boolean;
  opponent: { type: "ai"; agent_id: string; profile_version?: number };
  created_at: string;
  updated_at: string;
  version: number;
  human_move?: string | null;
  agent_move?: string | null;
  agent_status?: "not_requested" | "pending" | "moved" | "error" | "superseded";
  error?: string | null;
}
export interface HumanMoveRequest {
  move: string;
  version: number;
  client_move_id: string; // UUID estável para retry da mesma intenção
}
export interface GameError { code: string; message: string }

export interface AgentProfile {
  id: string; display_name: string; description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  style: "balanced" | "aggressive" | "positional" | "tactical";
}
