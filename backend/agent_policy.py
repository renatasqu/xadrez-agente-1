"""Seleção determinística v1: qualidade precede estilo; sem LLM/RAG."""
from dataclasses import dataclass
import chess
import chess_engine
from agent_profiles import DIFFICULTIES, AgentProfile, resolve_profile
from games import Opponent


def quality_candidates(candidates, profile: AgentProfile):
    """Mate é categoria separada: vencer antes de CP, evitar perder antes de estilo."""
    wins = [c for c in candidates if c.mate is not None and c.mate > 0]
    if wins:
        shortest = min(c.mate for c in wins)
        return [c for c in wins if c.mate == shortest]
    safe = [c for c in candidates if c.cp is not None and c.mate is None]
    if safe:
        best = max(c.cp for c in safe)
        return [c for c in safe if best - c.cp <= DIFFICULTIES[profile.difficulty].quality_cp]
    losses = [c for c in candidates if c.mate is not None and c.mate < 0]
    if losses:
        longest = min(c.mate for c in losses)
        return [c for c in losses if c.mate == longest]
    raise chess_engine.ErroDoMotor('Sem avaliação utilizável')


def style_features(board: chess.Board, candidate) -> "StyleFeatures":
    move = chess.Move.from_uci(candidate.move)
    piece = board.piece_at(move.from_square)
    after = board.copy(stack=True); after.push(move)
    capture, check = int(board.is_capture(move)), int(board.gives_check(move))
    development = int(piece.piece_type in (chess.KNIGHT, chess.BISHOP) and chess.square_rank(move.from_square) == (0 if board.turn else 7))
    center = int(move.to_square in chess_engine.CENTRO)
    # Ataques geométricos são atividade, não prova de ganho forçado.
    pressure = sum(after.piece_at(sq) is not None and after.piece_at(sq).color != board.turn
                   for sq in after.attacks(move.to_square))
    defended = int(after.is_attacked_by(board.turn, move.to_square))
    exposed = int(after.is_attacked_by(not board.turn, move.to_square))
    doubled = int(piece.piece_type == chess.PAWN and len(after.pieces(chess.PAWN, board.turn) & chess.SquareSet(chess.BB_FILES[chess.square_file(move.to_square)])) > 1)
    replay = board.copy(stack=True)
    forcing = 0
    for uci in candidate.pv:
        step = chess.Move.from_uci(uci)
        if step not in replay.legal_moves: break
        if replay.turn == board.turn:
            forcing += int(replay.is_capture(step)) + 2 * int(replay.gives_check(step))
        replay.push(step)
    return StyleFeatures(check, capture, development, center, pressure, defended, exposed,
                         doubled, int(board.is_castling(move)), forcing)


@dataclass(frozen=True)
class StyleFeatures:
    check: int
    capture: int
    development: int
    center_destination: int
    attacked_enemy_pieces: int
    defended_destination: int
    exposed_destination: int
    doubled_pawn: int
    castling: int
    own_pv_forcing: int

    def score(self, style: str) -> int:
        if style == 'aggressive':
            return 4*self.check + 2*self.capture + self.attacked_enemy_pieces + 2*self.center_destination + self.development
        if style == 'positional':
            return 4*self.castling + 3*self.development + 2*self.center_destination + self.defended_destination - 2*self.exposed_destination - 2*self.doubled_pawn
        if style == 'tactical':
            return 5*self.check + 3*self.capture + self.own_pv_forcing
        return 0


def style_score(board: chess.Board, candidate, style: str) -> int:
    return style_features(board, candidate).score(style)


@dataclass(frozen=True)
class CandidateTrace:
    candidate: chess_engine.Candidate
    features: StyleFeatures
    style_score: int
    eligible: bool


@dataclass(frozen=True)
class DecisionTrace:
    profile_id: str
    profile_version: int
    difficulty: str
    style: str
    perspective: str
    selected: chess_engine.Candidate
    engine_best: chess_engine.Candidate
    candidates: tuple[CandidateTrace, ...]
    quality_loss_cp: int | None
    mate_classification: str
    reason: str

    @property
    def candidate_count(self): return len(self.candidates)

    @property
    def eligible_count(self): return sum(c.eligible for c in self.candidates)


def mate_classification(best, selected):
    if best.mate is not None and best.mate > 0:
        if selected.mate is None or selected.mate <= 0: return 'winning_mate_lost'
        return 'winning_mate_preserved' if selected.mate == best.mate else 'winning_mate_slower'
    if best.mate is not None and best.mate < 0: return 'inevitable_losing_mate'
    return 'cp'


def decision_trace(board, legal_moves, candidates, profile) -> DecisionTrace:
    # Reuse the very same selector; telemetry never decides a second move.
    selected_uci = select_candidate(board, legal_moves, candidates, profile)
    legal = set(legal_moves) & {m.uci() for m in board.legal_moves}
    valid = [c for c in candidates if c.move in legal and c.perspective == 'side_to_move']
    eligible = quality_candidates(valid, profile)
    selected = next(c for c in eligible if c.move == selected_uci)
    def engine_order(c):
        if c.mate is not None and c.mate > 0: return (0, c.mate, c.rank, c.move)
        if c.cp is not None and c.mate is None: return (1, -c.cp, c.rank, c.move)
        return (2, c.mate, c.rank, c.move)
    best = min(valid, key=engine_order)
    loss = best.cp - selected.cp if best.mate is None and selected.mate is None else None
    rows = tuple(CandidateTrace(c, style_features(board, c), style_score(board, c, profile.style), c in eligible) for c in valid)
    reason = 'second_eligible_rank' if profile.difficulty == 'beginner' and profile.style == 'balanced' and all(c.mate is None for c in eligible) else 'engine_rank' if profile.style == 'balanced' else 'style_score_then_rank_uci'
    return DecisionTrace(profile.id, profile.version, profile.difficulty, profile.style, 'side_to_move', selected, best, rows, loss, mate_classification(best, selected), reason)


def select_candidate(board, legal_moves, candidates, profile):
    legal = set(legal_moves) & {m.uci() for m in board.legal_moves}
    valid = [c for c in candidates if c.move in legal and c.perspective == 'side_to_move']
    eligible = quality_candidates(valid, profile)
    if profile.style == 'balanced':
        if profile.difficulty == 'beginner' and all(c.mate is None for c in eligible):
            # Variação controlada: segunda alternativa do motor dentro da janela.
            return sorted(eligible, key=lambda c: (c.rank, c.move))[min(1, len(eligible)-1)].move
        return min(eligible, key=lambda c: (c.rank, c.move)).move
    return max(eligible, key=lambda c: (style_score(board, c, profile.style), -c.rank, c.move)).move


class StockfishPolicy:
    def choose_move(self, board: chess.Board, legal_moves: tuple[str, ...], config: Opponent) -> str:
        profile = resolve_profile(config.agent_id, config.profile_version)
        if profile.policy != 'stockfish_candidates_v1':
            raise ValueError('Policy desconhecida')
        actual = tuple(m.uci() for m in board.legal_moves)
        if set(actual) != set(legal_moves):
            raise ValueError('Lista legal inconsistente')
        if len(actual) == 1:
            return actual[0]
        budget = DIFFICULTIES[profile.difficulty]
        candidates = chess_engine.gerar_candidatos(board, tempo=budget.time, nodes=budget.nodes, quantidade=budget.candidates)
        return select_candidate(board, actual, candidates, profile)

    def trace_move(self, board: chess.Board, legal_moves: tuple[str, ...], config: Opponent) -> DecisionTrace:
        profile = resolve_profile(config.agent_id, config.profile_version)
        if profile.policy != 'stockfish_candidates_v1': raise ValueError('Policy desconhecida')
        actual = tuple(m.uci() for m in board.legal_moves)
        if set(actual) != set(legal_moves): raise ValueError('Lista legal inconsistente')
        if len(actual) == 1:
            candidate = chess_engine.Candidate(actual[0], None, None, (actual[0],), 1)
            features = style_features(board, candidate)
            return DecisionTrace(profile.id, profile.version, profile.difficulty, profile.style, 'side_to_move', candidate, candidate,
                                 (CandidateTrace(candidate, features, features.score(profile.style), True),), None, 'single_legal_move', 'single_legal_move')
        budget = DIFFICULTIES[profile.difficulty]
        candidates = chess_engine.gerar_candidatos(board, tempo=budget.time, nodes=budget.nodes, quantidade=budget.candidates)
        return decision_trace(board, actual, candidates, profile)
