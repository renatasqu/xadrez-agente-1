"""API FastAPI: rotas, CORS, rate limit, timeout e erros com mensagens amigáveis.

Rodar: cd backend && uvicorn main:app --reload

Rotas:
    GET  /health               o que está disponível (Stockfish, índices, chave da API)
    POST /chat                 {mensagem, fen?} -> Resposta (roteador completo)
    POST /analisar             {fen} -> Resposta (Analista)
    POST /recomendar           {mensagem} -> Resposta só com onde_ler ("Qual documento me ajuda?")
    POST /licao/proxima        {usuario_id?} -> entrega a próxima lição e avança o progresso
    GET  /licao/atual          ?usuario_id= -> só lê a lição atual (não muda nada)
    GET  /documentos/{nome}    o PDF/TXT de backend/docs (só os da lista do config)
    GET  /documentos/{nome}/contexto?chunk_id=  o trecho com os parágrafos em volta
    POST /ingest               reingere os documentos (só com X-Admin-Token = ADMIN_TOKEN)

As rotas legadas usam `Resposta` (resposta, fontes, agente, confianca) nos erros.
O namespace /exercises possui contrato operacional próprio: code e message.

O pipeline (LLM, busca, Stockfish) é bloqueante: roda numa thread (run_in_threadpool) com
limite de TIMEOUT_REQUISICAO segundos. Limitação conhecida: a thread não pode ser interrompida;
depois do timeout ela continua até os timeouts do próprio LLM (e o Stockfish é fechado no
`finally` do Analista).
"""

import asyncio
import logging
import secrets
import threading
import uuid
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from langchain_core.language_models.chat_models import BaseChatModel
from slowapi.errors import RateLimitExceeded
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as ErroHttpDoStarlette

import documentos
import guardrails
import progresso
import games
import conceitos
from agents import analista, router
from agents.licoes import LICOES
from config import INDICES, settings
from auth import router as auth_router, limiter, require_user
from masters import router as masters_router
from exercises.api import router as exercises_router
from exercises.api import http_error_response, internal_error_response, is_exercise_path, request_error_response
from schemas import (
    ContextoDoTrecho,
    EntradaAnalise,
    EntradaChat,
    EntradaLicao,
    EntradaRecomendacao,
    InfoLicao,
    Resposta,
    RespostaLicao,
    Saude,
    ProgressoExercicio,
    EstadoAnalise,
)

log = logging.getLogger(__name__)

PERGUNTA_ANALISE = "Qual é o melhor lance nesta posição?"
FIM_DO_CURSO = "Parabéns! Você concluiu todas as lições. Continue praticando no tabuleiro."
MSG_LIMITE = "Muitas perguntas em pouco tempo. Espere um minuto e tente de novo."
MSG_INVALIDO = "Não entendi a requisição. Confira os campos enviados."
MSG_ERRO_INTERNO = "Ocorreu um erro inesperado. Tente de novo em instantes."
MSG_INGERINDO = "Os documentos estão sendo atualizados. Tente de novo em um minuto."
MSG_ID_INVALIDO = "usuario_id inválido: use o id devolvido pelo servidor."
MSG_SEM_LICAO = "Você ainda não começou as lições. Peça a próxima lição para começar."
MSG_INGEST_DESATIVADO = "Ingestão pela API desativada: defina ADMIN_TOKEN no .env."
MSG_TOKEN_INVALIDO = "Token de administração inválido."

# Sinaliza que POST /ingest está recriando as coleções (as buscas falhariam nesse meio-tempo).
ingerindo = threading.Event()


class TempoEsgotado(Exception):
    """O pipeline passou de TIMEOUT_REQUISICAO segundos."""


class Indisponivel(Exception):
    """Serviço temporariamente indisponível (ex.: ingestão em andamento)."""


def corpo(texto: str, agente: str = "roteador") -> dict:
    """Corpo no formato de Resposta, usado também nos erros."""
    return Resposta(resposta=texto, fontes=[], agente=agente, confianca=0).model_dump()


# --------------------------------------------------------------------------- dependências


@dataclass
class LLMs:
    """LLMs usados pelas rotas. None = o padrão do .env; os testes trocam por LLMs falsos."""

    classificador: BaseChatModel | None = None
    agente: BaseChatModel | None = None
    juiz: BaseChatModel | None = None


def obter_llms() -> LLMs:
    """Dependência do FastAPI (sobrescrita nos testes com app.dependency_overrides)."""
    return LLMs()


async def executar(funcao: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    """Roda o pipeline bloqueante numa thread, com limite de tempo."""
    if ingerindo.is_set():
        raise Indisponivel
    try:
        return await asyncio.wait_for(
            run_in_threadpool(funcao, *args, **kwargs), timeout=settings.timeout_requisicao
        )
    except asyncio.TimeoutError:
        guardrails.registrar("llm", "timeout_requisicao", f"{settings.timeout_requisicao:g} s")
        raise TempoEsgotado from None


# --------------------------------------------------------------------------- app


def aquecer() -> None:
    """Carrega o modelo de embeddings e abre o ChromaDB uma vez, antes da 1ª requisição."""
    from ingest import cliente_chroma, gerar_embeddings

    gerar_embeddings(["aquecimento"], tipo="consulta")
    cliente_chroma().list_collections()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Na subida: tabelas do SQLite e (opcional) embeddings + ChromaDB em memória."""
    progresso.criar_tabelas()
    games.criar_tabelas()
    if settings.aquecer_na_inicializacao:
        try:
            await run_in_threadpool(aquecer)
        except Exception as erro:
            log.warning("retrieval_error: warmup %s", type(erro).__name__)
    yield


app = FastAPI(title="Xadrez Agente", lifespan=lifespan)
app.include_router(exercises_router)
app.include_router(games.router)
app.include_router(games.agents_router)
app.include_router(auth_router)
app.include_router(masters_router)
app.state.exercise_recorder = progresso.registrar_exercicio
app.state.limiter = limiter
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origens,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Admin-Token"],
)


@app.exception_handler(RateLimitExceeded)
async def limite_excedido(request: Request, erro: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(corpo(MSG_LIMITE), status_code=429)


@app.exception_handler(RequestValidationError)
async def requisicao_invalida(request: Request, erro: RequestValidationError) -> JSONResponse:
    if is_exercise_path(request.url.path):
        return request_error_response(erro)
    return JSONResponse(corpo(MSG_INVALIDO), status_code=422)


MSG_NAO_ENCONTRADO = "Não encontrei esse endereço ou documento."


# A classe do Starlette também pega o 404/405 do próprio roteador (rota que não existe),
# para que esses erros venham no formato de Resposta como os outros.
@app.exception_handler(ErroHttpDoStarlette)
async def erro_http(request: Request, erro: ErroHttpDoStarlette) -> JSONResponse:
    if is_exercise_path(request.url.path):
        return http_error_response(erro)
    if isinstance(erro, HTTPException):  # levantado por nós: a mensagem já está em português
        detalhe = str(erro.detail)
    else:  # do roteador ("Not Found", "Method Not Allowed")
        detalhe = MSG_NAO_ENCONTRADO if erro.status_code == 404 else MSG_INVALIDO
    return JSONResponse(corpo(detalhe), status_code=erro.status_code)


@app.exception_handler(TempoEsgotado)
async def tempo_esgotado(request: Request, erro: TempoEsgotado) -> JSONResponse:
    return JSONResponse(corpo(guardrails.SERVICO_INDISPONIVEL), status_code=504)


@app.exception_handler(Indisponivel)
async def indisponivel(request: Request, erro: Indisponivel) -> JSONResponse:
    return JSONResponse(corpo(MSG_INGERINDO), status_code=503)


@app.exception_handler(Exception)
async def erro_inesperado(request: Request, erro: Exception) -> JSONResponse:
    log.exception("Erro inesperado em %s", request.url.path)  # detalhe só no servidor
    if is_exercise_path(request.url.path):
        return internal_error_response()
    return JSONResponse(corpo(MSG_ERRO_INTERNO), status_code=500)


# --------------------------------------------------------------------------- rotas


def contar_indices() -> dict[str, int]:
    """Nº de chunks em cada índice (0 se a coleção não existe)."""
    from ingest import cliente_chroma

    cliente = cliente_chroma()
    existentes = {c.name for c in cliente.list_collections()}
    return {i: cliente.get_collection(i).count() if i in existentes else 0 for i in INDICES}


def tem_chave_api() -> bool:
    """A chave do provedor escolhido está no .env? (O Ollama roda local e não precisa.)"""
    chaves = {"anthropic": settings.anthropic_api_key, "openai": settings.openai_api_key}
    return bool(chaves.get(settings.llm_provider.lower(), "ok"))


@app.get("/health", response_model=Saude)
async def health() -> Saude:
    """Diz se Stockfish, índices e chave da API estão disponíveis. Sem rate limit."""
    indices = await run_in_threadpool(contar_indices)
    stockfish = analista.caminho_do_stockfish() is not None
    chave = tem_chave_api()
    tudo_ok = stockfish and chave and all(indices.values())
    return Saude(
        status="ok" if tudo_ok else "degradado",
        stockfish=stockfish,
        indices=indices,
        chave_api=chave,
        llm_provider=settings.llm_provider,
    )


@app.post("/chat", response_model=Resposta, dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def chat(request: Request, entrada: EntradaChat, llms: LLMs = Depends(obter_llms)) -> Resposta:
    """Pergunta livre: passa pelo roteador completo (guardrails, agente, juiz)."""
    return await executar(
        router.responder,
        entrada.mensagem,
        fen=entrada.fen,
        llm_classificador=llms.classificador,
        llm_agente=llms.agente,
        llm_juiz=llms.juiz,
    )


@app.post("/recomendar", response_model=Resposta, dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def recomendar(request: Request, entrada: EntradaRecomendacao, llms: LLMs = Depends(obter_llms)) -> Resposta:
    """"Qual documento me ajuda?": os trechos para ler (sem resposta escrita pelo agente)."""
    return await executar(router.recomendar, entrada.mensagem, llms.classificador)


def preparar_fen(fen: str) -> tuple[analista.Analise | None, Resposta]:
    """Guardrails de entrada e etapa enxadrística independente de corpus/linguagem."""
    _, bloqueio = guardrails.validar_entrada(PERGUNTA_ANALISE, fen)
    if bloqueio:
        log.warning("invalid_position")
        return None, bloqueio.model_copy(update={"analise": EstadoAnalise(status="invalid_position")})
    return analista.preparar_resposta(PERGUNTA_ANALISE, fen)


@app.post("/analisar", response_model=Resposta, dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def analisar(request: Request, entrada: EntradaAnalise, llms: LLMs = Depends(obter_llms)) -> Resposta:
    """Fatos preservados mesmo quando a explicação falha ou excede o orçamento HTTP."""
    inicio = time.monotonic()
    try:
        analise, resposta = await asyncio.wait_for(
            run_in_threadpool(preparar_fen, entrada.fen), timeout=settings.timeout_requisicao)
    except asyncio.TimeoutError:
        log.warning("engine_error: timeout")
        return analista.erro_engine()
    if analise is None or analise.fim_de_jogo:
        return resposta
    restante = settings.timeout_requisicao - (time.monotonic() - inicio)
    if restante <= 0:
        return analista.sem_explicacao(resposta, "explanation_timeout")
    if ingerindo.is_set():
        log.warning("retrieval_error: ingest_in_progress")
        return analista.sem_explicacao(resposta, "retrieval_error")
    try:
        enriquecida = await asyncio.wait_for(
            run_in_threadpool(analista.enriquecer_resposta, analise, resposta,
                              PERGUNTA_ANALISE, llms.agente, llms.juiz), timeout=restante)
    except asyncio.TimeoutError:
        log.warning("explanation_timeout")
        return analista.sem_explicacao(resposta, "explanation_timeout")
    return guardrails.checar_saida(enriquecida)


@app.get("/progresso/exercicios", response_model=list[ProgressoExercicio], dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def progresso_dos_exercicios(request: Request, usuario_id: uuid.UUID | None = None, user: dict = Depends(require_user)) -> list[dict]:
    """Progresso da conta; UUID opcional sempre exige propriedade."""
    return await run_in_threadpool(progresso.ler_exercicios, progresso.identidade(user["email"], str(usuario_id) if usuario_id else None))


# --------------------------------------------------------------------------- lições


def validar_usuario_id(usuario_id: str | None) -> str:
    """Devolve o id normalizado; cria um novo se vier vazio. Só aceita UUID (nada de e-mail)."""
    if not usuario_id:
        return str(uuid.uuid4())
    try:
        return str(uuid.UUID(usuario_id))
    except ValueError:
        raise HTTPException(status_code=400, detail=MSG_ID_INVALIDO) from None


def info(numero: int) -> InfoLicao:
    """Metadados da lição `numero` (começa em 1)."""
    licao = LICOES[numero - 1]
    return InfoLicao(numero=numero, total=len(LICOES), modulo=licao.modulo, titulo=licao.titulo)


def conteudo_da_licao(numero: int, llms: LLMs) -> Resposta:
    """Conteúdo da lição: do cache ou gerado pelo agente do índice da lição."""
    guardado = progresso.ler_cache(numero)
    if guardado:
        return conceitos.associar(guardado, conceitos.LICAO_CONCEITOS.get(numero, []))
    licao = LICOES[numero - 1]
    conteudo = router.responder(
        licao.pergunta,
        llm_agente=llms.agente,
        llm_juiz=llms.juiz,
        categoria=licao.categoria,
    )
    if conteudo.fontes:
        conteudo = conceitos.associar(conteudo, conceitos.LICAO_CONCEITOS.get(numero, []))
    if conteudo.fontes:  # só guarda (e só conta como entregue) lição com fonte
        progresso.gravar_cache(numero, conteudo)
    return conteudo


def entregar_proxima(usuario_id: str, llms: LLMs) -> RespostaLicao:
    """Gera a próxima lição e avança o progresso só se ela veio com fontes."""
    numero = progresso.proxima_licao(usuario_id)
    if numero > len(LICOES):
        return RespostaLicao(
            usuario_id=usuario_id, concluido=True, licao=None,
            conteudo=Resposta(resposta=FIM_DO_CURSO, fontes=[], agente="professor", confianca=0),
        )
    conteudo = conteudo_da_licao(numero, llms)
    if conteudo.fontes:
        progresso.avancar(usuario_id, numero)
    return RespostaLicao(usuario_id=usuario_id, concluido=False, licao=info(numero), conteudo=conteudo,
                         concept_ids=conteudo.concept_ids, related_exercise_ids=conteudo.related_exercise_ids)


def ler_atual(usuario_id: str, llms: LLMs) -> RespostaLicao:
    """Última lição entregue ao usuário (não muda o progresso)."""
    proxima = progresso.proxima_licao(usuario_id)
    if proxima == 1:
        raise HTTPException(status_code=404, detail=MSG_SEM_LICAO)
    atual = proxima - 1
    conteudo = conteudo_da_licao(atual, llms)
    return RespostaLicao(
        usuario_id=usuario_id,
        concluido=proxima > len(LICOES),
        licao=info(atual),
        conteudo=conteudo,
        concept_ids=conteudo.concept_ids, related_exercise_ids=conteudo.related_exercise_ids,
    )


@app.post("/licao/proxima", response_model=RespostaLicao, dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def licao_proxima(
    request: Request, entrada: EntradaLicao, llms: LLMs = Depends(obter_llms), user: dict = Depends(require_user)
) -> RespostaLicao:
    """Entrega a próxima lição (regras → notação → aberturas → tática → finais) e avança."""
    return await executar(entregar_proxima, progresso.identidade(user["email"], validar_usuario_id(entrada.usuario_id) if entrada.usuario_id else None), llms)


@app.get("/licao/atual", response_model=RespostaLicao, dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def licao_atual(
    request: Request, usuario_id: str | None = None, llms: LLMs = Depends(obter_llms), user: dict = Depends(require_user)
) -> RespostaLicao:
    """Só lê a lição atual do usuário."""
    if usuario_id == "":
        raise HTTPException(status_code=400, detail=MSG_ID_INVALIDO)
    return await executar(ler_atual, progresso.identidade(user["email"], validar_usuario_id(usuario_id) if usuario_id else None), llms)


# --------------------------------------------------------------------------- documentos


@app.get("/documentos/{nome}", dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def documento(request: Request, nome: str) -> FileResponse:
    """Serve o arquivo local do documento, para abrir no navegador (PDF na página certa)."""
    try:
        caminho = documentos.caminho_seguro(nome)
    except documentos.DocumentoNaoEncontrado:
        raise HTTPException(status_code=404, detail=MSG_NAO_ENCONTRADO) from None
    return FileResponse(
        caminho,
        media_type=documentos.tipo_do_arquivo(caminho),
        headers={
            "Content-Disposition": f'inline; filename="{caminho.name}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/documentos/{nome}/contexto", response_model=ContextoDoTrecho, dependencies=[Depends(require_user)])
@limiter.limit(lambda: settings.rate_limit)
async def contexto_do_trecho(request: Request, nome: str, chunk_id: str) -> ContextoDoTrecho:
    """O trecho com os parágrafos em volta (usado para os livros em TXT)."""
    try:
        dados = await run_in_threadpool(documentos.contexto, nome, chunk_id)
    except documentos.DocumentoNaoEncontrado:
        raise HTTPException(status_code=404, detail=MSG_NAO_ENCONTRADO) from None
    return ContextoDoTrecho(**dados)


# --------------------------------------------------------------------------- ingestão


def reingerir() -> dict[str, int]:
    """Recria as coleções e limpa o cache das lições (o conteúdo pode ter mudado)."""
    from ingest import ingerir

    ingerindo.set()
    try:
        resumo = ingerir()
    finally:
        ingerindo.clear()
    progresso.limpar_cache()
    documentos.paginas_do_documento.cache_clear()
    return resumo


@app.post("/ingest")
@limiter.limit("1/minute")
async def ingest(request: Request, x_admin_token: str = Header(default="")) -> dict:
    """Reingere os documentos. Desativado sem ADMIN_TOKEN; demora ~1 min (sem o timeout de 30 s)."""
    if not settings.admin_token:
        raise HTTPException(status_code=403, detail=MSG_INGEST_DESATIVADO)
    if not secrets.compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(status_code=403, detail=MSG_TOKEN_INVALIDO)
    if ingerindo.is_set():
        raise Indisponivel
    return {"chunks": await run_in_threadpool(reingerir)}
