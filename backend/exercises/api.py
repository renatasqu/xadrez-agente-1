"""Validação stateless autenticada; progresso da conta via adaptador da aplicação.

O catálogo do servidor é a autoridade, nunca o payload do cliente.
"""

import chess
from uuid import UUID
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Request, Depends
from auth import require_user
import progresso
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from starlette.exceptions import HTTPException
from starlette.responses import Response

from .catalog import CATALOG
from .models import AvoidMaterialLossGoal, Exercise, ExerciseClientError, ExerciseError, KnightForkGainGoal, ValidationRequest, ValidationResult
from .validation import validate
from .hints import next_hint
from .models import HintRequest, HintResponse

ERROR_STATUS = {"exercise_not_found": 404, "version_mismatch": 409,
                "invalid_history": 422, "invalid_action": 422,
                "incompatible_action": 422, "invalid_request": 422, "internal_error": 500}


def is_exercise_path(path: str) -> bool:
    """Limite exato do namespace; não captura /exercises-other."""
    return path == "/exercises" or path.startswith("/exercises/")


def error_response(error: ExerciseError, status_code: int | None = None,
                   headers: dict[str, str] | None = None) -> JSONResponse:
    """Contrato operacional independente dos contratos de chat e RAG."""
    return JSONResponse(error.model_dump(), status_code=status_code or ERROR_STATUS[error.code], headers=headers)


def request_error_response(error: RequestValidationError) -> JSONResponse:
    """Classifica erros de schema pela localização do campo, sem interpretar texto."""
    fields = {item["loc"][1] for item in error.errors()
              if len(item["loc"]) > 1 and item["loc"][0] == "body"}
    if "history" in fields:
        code, message = "invalid_history", "Histórico inválido: confira a lista de lances UCI"
    elif "action" in fields or "last_action" in fields:
        code, message = "invalid_action", "Ação inválida: confira o tipo e os campos enviados"
    else:
        code, message = "invalid_request", "Requisição inválida: confira os campos enviados"
    return error_response(ExerciseError(code=code, message=message))


def http_error_response(error: HTTPException) -> JSONResponse:
    """Normaliza erros de roteamento do namespace mantendo status e headers."""
    code = {404: "exercise_not_found", 409: "version_mismatch"}.get(error.status_code, "invalid_request")
    message = "Exercício inexistente" if error.status_code == 404 else "Requisição inválida para exercícios"
    if error.status_code >= 500:
        return internal_error_response()
    return error_response(ExerciseError(code=code, message=message), error.status_code, error.headers)


def internal_error_response() -> JSONResponse:
    """Não expõe detalhes de bugs ou configurações internas ao cliente."""
    return error_response(ExerciseError(code="internal_error", message="Erro interno ao processar o exercício"))


class ExerciseRoute(APIRoute):
    """Preserva erros esperados também quando o router é usado isoladamente."""

    def get_route_handler(self) -> Callable[[Request], Awaitable[Response]]:
        original = super().get_route_handler()

        async def handle(request: Request) -> Response:
            try:
                return await original(request)
            except ExerciseClientError as error:
                return error_response(ExerciseError(code=error.code, message=error.message))
            except RequestValidationError as error:
                return request_error_response(error)

        return handle


router = APIRouter(prefix="/exercises", tags=["exercises"], route_class=ExerciseRoute, dependencies=[Depends(require_user)],
                   responses={status: {"model": ExerciseError} for status in (404, 409, 422, 500)})


def get_exercise(exercise_id: str) -> Exercise:
    if exercise_id not in CATALOG:
        raise ExerciseClientError("exercise_not_found", "Exercício inexistente")
    exercise = CATALOG[exercise_id]
    if isinstance(exercise.goal, (KnightForkGainGoal, AvoidMaterialLossGoal)) and chess.Board(exercise.fen).is_game_over(claim_draw=False):
        # Catálogo inválido é erro do servidor, detectado já na resolução/GET.
        raise RuntimeError("O exercício exige uma posição inicial não terminal")
    return exercise


@router.get("/{exercise_id}", response_model=Exercise)
def read_exercise(exercise_id: str) -> Exercise:
    return get_exercise(exercise_id)


@router.post("/{exercise_id}/validate", response_model=ValidationResult)
def validate_exercise(exercise_id: str, request: ValidationRequest,
                      http_request: Request = None, usuario_id: UUID | None = None, user: dict = Depends(require_user)) -> ValidationResult:
    exercise = get_exercise(exercise_id)
    if request.version != exercise.version:
        raise ExerciseClientError("version_mismatch", "Versão incompatível")
    # Somente erros explícitos de protocolo viram 4xx no adaptador da rota.
    recorder = None
    if usuario_id is not None or (http_request is not None and getattr(http_request.app.state, "exercise_recorder", None) is not None):
        recorder = getattr(http_request.app.state, "exercise_recorder", None) if http_request else None
        if recorder is None:
            raise ExerciseClientError("invalid_request", "Progresso indisponível neste adaptador")
    identity = progresso.identidade(user["email"], str(usuario_id) if usuario_id else None) if recorder is not None else None
    result = validate(exercise, request.action, request.history)
    if recorder is not None:
        recorder(identity, exercise.id, result.status)
    return result


@router.post("/{exercise_id}/hint", response_model=HintResponse)
def request_hint(exercise_id: str, request: HintRequest) -> HintResponse:
    exercise = get_exercise(exercise_id)
    if request.version != exercise.version:
        raise ExerciseClientError("version_mismatch", "Versão incompatível")
    return HintResponse(next_hint=next_hint(exercise, request))
