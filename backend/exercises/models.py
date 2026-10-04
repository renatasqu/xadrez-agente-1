"""Contratos fechados da primeira entrega; unions crescem por novas variantes."""

from typing import Annotated, Literal

import chess
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator


def valid_uci(value: str) -> str:
    """Valida sintaxe UCI; legalidade depende da posição do produtor."""
    chess.Move.from_uci(value)
    return value

Square = Annotated[str, Field(pattern=r"^[a-h][1-8]$")]
UciMove = Annotated[str, Field(pattern=r"^[a-h][1-8][a-h][1-8][qrbn]?$"), AfterValidator(valid_uci)]
History = Annotated[list[UciMove], Field(max_length=4)]
Side = Literal["kingside", "queenside"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


ClientErrorCode = Literal["exercise_not_found", "version_mismatch", "invalid_history", "invalid_action", "incompatible_action", "invalid_request"]


class ExerciseError(Contract):
    code: ClientErrorCode | Literal["internal_error"]
    message: str


class ExerciseClientError(ValueError):
    """Erro esperado de protocolo; ValueError comum não é erro do cliente."""

    def __init__(self, code: ClientErrorCode, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class PieceRef(Contract):
    square: Square
    piece: Literal["pawn", "knight", "bishop", "rook", "queen", "king"] = "knight"
    color: Literal["white", "black"]


class ReachLegalSquareGoal(Contract):
    type: Literal["reach_legal_square"] = "reach_legal_square"
    piece: PieceRef

    @field_validator("piece")
    @classmethod
    def knight_only(cls, value: PieceRef) -> PieceRef:
        if value.piece != "knight":
            raise ValueError("O objetivo exige um cavalo")
        return value


class KnightForkGainGoal(Contract):
    type: Literal["knight_fork_gain"] = "knight_fork_gain"
    piece: PieceRef
    min_material_gain: Annotated[StrictInt, Field(ge=1)]
    max_student_moves: Literal[2] = 2
    opponent_policy: Literal["material_minimax_v1"] = "material_minimax_v1"

    @field_validator("piece")
    @classmethod
    def knight_only(cls, value: PieceRef) -> PieceRef:
        if value.piece != "knight":
            raise ValueError("O objetivo exige um cavalo")
        return value

    @field_validator("max_student_moves", mode="before")
    @classmethod
    def exactly_two_moves(cls, value: object) -> object:
        if type(value) is not int or value != 2:
            raise ValueError("A3 v1 exige exatamente dois lances do aluno")
        return value


class AnswerPositionQuestionGoal(Contract):
    type: Literal["answer_position_question"] = "answer_position_question"
    question: Literal["can_castle"] = "can_castle"
    side: Side


class AvoidMaterialLossGoal(Contract):
    type: Literal["avoid_material_loss"] = "avoid_material_loss"
    max_material_loss: Annotated[StrictInt, Field(ge=0)] = 0
    horizon_plies: Literal[3] = 3
    opponent_policy: Literal["bounded_safety_v1"] = "bounded_safety_v1"

    @field_validator("horizon_plies", mode="before")
    @classmethod
    def exactly_three_plies(cls, value: object) -> object:
        if type(value) is not int or value != 3:
            raise ValueError("E1 v1 exige exatamente três plies")
        return value


TypedGoal = Annotated[ReachLegalSquareGoal | AnswerPositionQuestionGoal | KnightForkGainGoal | AvoidMaterialLossGoal, Field(discriminator="type")]


class Exercise(Contract):
    id: str
    version: Annotated[StrictInt, Field(ge=1)] = 1
    prompt: str
    fen: str
    goal: TypedGoal

    @field_validator("fen")
    @classmethod
    def valid_fen(cls, value: str) -> str:
        board = chess.Board(value)
        # Direitos inconsistentes precisam ser diagnosticáveis (torre ausente).
        if board.status() & ~chess.STATUS_BAD_CASTLING_RIGHTS:
            raise ValueError("Posição inválida")
        return value

    @model_validator(mode="after")
    def valid_piece(self) -> "Exercise":
        if isinstance(self.goal, AvoidMaterialLossGoal) and not chess.Board(self.fen).is_valid():
            raise ValueError("E1 exige uma posição válida")
        if isinstance(self.goal, (ReachLegalSquareGoal, KnightForkGainGoal)):
            board = chess.Board(self.fen)
            if isinstance(self.goal, KnightForkGainGoal) and not board.is_valid():
                raise ValueError("A3 exige uma posição válida")
            color = self.goal.piece.color == "white"
            if board.turn != color or board.piece_at(chess.parse_square(self.goal.piece.square)) != chess.Piece(chess.KNIGHT, color):
                raise ValueError("O cavalo indicado deve existir e ter a vez")
        return self


class MoveAction(Contract):
    type: Literal["move"] = "move"
    source: Square
    destination: Square


class AnswerAction(Contract):
    type: Literal["answer"] = "answer"
    answer: StrictBool


ExerciseAction = Annotated[MoveAction | AnswerAction, Field(discriminator="type")]


class MoveFact(Contract):
    source: Square
    destination: Square


class LegalDestinationFact(MoveFact):
    code: Literal["legal_destination"] = "legal_destination"

    @model_validator(mode="after")
    def distinct_squares(self) -> "LegalDestinationFact":
        if self.source == self.destination:
            raise ValueError("Origem e destino devem ser diferentes")
        return self


class IllegalMoveFact(MoveFact):
    code: Literal["illegal_move"] = "illegal_move"


class StraightKnightMoveFact(MoveFact):
    code: Literal["straight_knight_move"] = "straight_knight_move"

    @model_validator(mode="after")
    def straight_geometry(self) -> "StraightKnightMoveFact":
        if self.source == self.destination:
            raise ValueError("Origem e destino devem ser diferentes")
        if self.source[0] != self.destination[0] and self.source[1] != self.destination[1]:
            raise ValueError("Movimento reto deve compartilhar coluna ou fileira")
        return self


class InvalidKnightGeometryFact(MoveFact):
    code: Literal["invalid_knight_geometry"] = "invalid_knight_geometry"


class OwnPieceOnDestinationFact(MoveFact):
    code: Literal["own_piece_on_destination"] = "own_piece_on_destination"


class WrongSourceFact(MoveFact):
    code: Literal["wrong_source"] = "wrong_source"
    expected_source: Square


class WrongPieceFact(MoveFact):
    code: Literal["wrong_piece"] = "wrong_piece"


class LeavesKingInCheckFact(MoveFact):
    code: Literal["leaves_king_in_check"] = "leaves_king_in_check"


class CastlingRightAbsentFact(Contract):
    code: Literal["castling_right_absent"] = "castling_right_absent"
    side: Side


class RookUnavailableFact(Contract):
    code: Literal["rook_unavailable"] = "rook_unavailable"
    square: Square


class PathOccupiedFact(Contract):
    code: Literal["path_occupied"] = "path_occupied"
    squares: Annotated[list[Square], Field(min_length=1)]

    @field_validator("squares")
    @classmethod
    def unique_squares(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("Casas não podem se repetir")
        return value


class KingInCheckFact(Contract):
    code: Literal["king_in_check"] = "king_in_check"
    square: Square


class TransitAttackedFact(Contract):
    code: Literal["transit_attacked"] = "transit_attacked"
    square: Square


class DestinationAttackedFact(Contract):
    code: Literal["destination_attacked"] = "destination_attacked"
    square: Square


class ForkFact(Contract):
    code: Literal["fork"] = "fork"
    attacker: PieceRef
    square: Square
    targets: Annotated[list[PieceRef], Field(min_length=2)]
    gives_check: StrictBool
    fen: str

    @model_validator(mode="after")
    def relevant_targets(self) -> "ForkFact":
        squares = [target.square for target in self.targets]
        if squares != sorted(set(squares)):
            raise ValueError("Alvos devem ser únicos e ordenados por casa")
        if self.attacker.piece != "knight" or self.attacker.square != self.square:
            raise ValueError("O atacante deve ser o cavalo na casa do garfo")
        if any(target.piece == "pawn" or target.color == self.attacker.color for target in self.targets):
            raise ValueError("Alvos devem ser peças adversárias relevantes, sem peões")
        return self


class OpponentReplyFact(Contract):
    code: Literal["opponent_reply"] = "opponent_reply"
    move: UciMove
    policy: Literal["material_minimax_v1"] = "material_minimax_v1"


class MaterialGainFact(Contract):
    code: Literal["material_gain"] = "material_gain"
    initial_balance: StrictInt
    final_balance: StrictInt
    net_gain: StrictInt
    required_gain: Annotated[StrictInt, Field(ge=1)]
    fen: str

    @model_validator(mode="after")
    def consistent_gain(self) -> "MaterialGainFact":
        if self.net_gain != self.final_balance - self.initial_balance:
            raise ValueError("Ganho deve ser a diferença entre os saldos")
        return self


RefutationReason = Literal["no_fork", "attacker_lost", "target_not_converted", "insufficient_gain", "terminal_failure"]


class RefutationLineFact(Contract):
    code: Literal["refutation_line"] = "refutation_line"
    reason: RefutationReason
    moves: Annotated[list[UciMove], Field(min_length=1, max_length=4)]
    resulting_fen: str
    net_gain: StrictInt
    required_gain: Annotated[StrictInt, Field(ge=1)]


class MaterialLossFact(Contract):
    code: Literal["material_loss"] = "material_loss"
    initial_balance: StrictInt
    final_balance: StrictInt
    loss: StrictInt
    max_material_loss: Annotated[StrictInt, Field(ge=0)]
    moves: Annotated[list[UciMove], Field(min_length=1, max_length=3)]
    resulting_fen: str

    @model_validator(mode="after")
    def consistent_loss(self) -> "MaterialLossFact":
        if self.loss != self.initial_balance - self.final_balance or self.loss <= self.max_material_loss:
            raise ValueError("Perda deve corresponder aos saldos e superar o limite")
        return self


class AllowsMateFact(Contract):
    code: Literal["allows_mate"] = "allows_mate"
    mated_king: PieceRef
    mate_in_opponent_moves: Literal[1] = 1
    moves: Annotated[list[UciMove], Field(min_length=1, max_length=3)]
    resulting_fen: str

    @field_validator("mated_king")
    @classmethod
    def king_only(cls, value: PieceRef) -> PieceRef:
        if value.piece != "king":
            raise ValueError("A peça em mate deve ser um rei")
        return value

    @field_validator("mate_in_opponent_moves", mode="before")
    @classmethod
    def exactly_one(cls, value: object) -> object:
        if type(value) is not int or value != 1:
            raise ValueError("E1 v1 detecta mate em um lance adversário")
        return value


Fact = Annotated[
    LegalDestinationFact | StraightKnightMoveFact | InvalidKnightGeometryFact
    | OwnPieceOnDestinationFact | WrongSourceFact | WrongPieceFact | LeavesKingInCheckFact
    | CastlingRightAbsentFact | RookUnavailableFact | PathOccupiedFact | KingInCheckFact
    | TransitAttackedFact | DestinationAttackedFact
    | ForkFact | OpponentReplyFact | MaterialGainFact | RefutationLineFact
    | IllegalMoveFact | MaterialLossFact | AllowsMateFact,
    Field(discriminator="code"),
]


class Hint(Contract):
    """Dica individual futura: conceito (1), peça/região (2), casas específicas (3)."""

    level: Literal[1, 2, 3]
    code: Literal["conceptual", "piece_or_region", "specific_squares"]
    highlight_squares: list[Square] = Field(default_factory=list)
    text: str | None = None

    @model_validator(mode="after")
    def valid_level(self) -> "Hint":
        codes = {1: "conceptual", 2: "piece_or_region", 3: "specific_squares"}
        if self.code != codes[self.level]:
            raise ValueError("Código incompatível com o nível da dica")
        if self.level > 1 and not self.highlight_squares:
            raise ValueError("Dicas de nível 2/3 devem destacar casas")
        if len(self.highlight_squares) != len(set(self.highlight_squares)):
            raise ValueError("Casas não podem se repetir")
        return self


class ValidationResult(Contract):
    """Status avalia o aluno; facts descrevem a posição ou tentativa.

    resulting_fen é o estado autoritativo do exercício após validar: o cliente
    deve usá-lo como fonte de verdade. Não é necessariamente a posição física
    de uma tentativa legal rejeitada pelo objetivo pedagógico.
    """

    status: Literal["correct", "incorrect", "partial"]
    resulting_fen: str = Field(description="Estado autoritativo do exercício após a validação")
    facts: list[Fact] = Field(default_factory=list)
    next_hint: Hint | None = None
    history: History = Field(default_factory=list)


class ValidationRequest(Contract):
    version: Annotated[StrictInt, Field(ge=1)]
    action: ExerciseAction
    history: History = Field(default_factory=list)
