"""Fábrica do LLM conforme LLM_PROVIDER (openai | anthropic | ollama)."""

import importlib
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel

from config import settings

Papel = Literal["agente", "classificador", "juiz"]


def _erros_de_api() -> tuple[type[Exception], ...]:
    """Erros de rede, timeout e limite de uso dos SDKs instalados (tratados pelo roteador)."""
    erros: list[type[Exception]] = [TimeoutError]
    for modulo, nome in [("anthropic", "APIError"), ("openai", "APIError"), ("httpx", "HTTPError")]:
        try:
            erros.append(getattr(importlib.import_module(modulo), nome))
        except (ImportError, AttributeError):
            pass
    return tuple(erros)


ERROS_DE_API = _erros_de_api()


class LLMNaoConfigurado(RuntimeError):
    """O provedor escolhido precisa de uma chave que não está no .env."""


def _opcoes_claude(modelo: str) -> dict:
    """Parâmetros que cada família de modelo Claude aceita.

    - Haiku 4.5: aceita `temperature`, mas recusa `effort` (erro 400).
    - Sonnet 5.5 / Opus 5.5: recusam `temperature` e sempre raciocinam; a profundidade é
      controlada por `effort`. Os `fallbacks` fazem a API repetir a pergunta em outro modelo
      se o filtro de segurança recusar por engano.
    """
    if "haiku" in modelo:
        return {"temperature": 0}
    return {
        "output_config": {"effort": settings.anthropic_effort},
        "betas": ["server-side-fallback-2026-07-01"],
        "model_kwargs": {"fallbacks": "default"},
    }


def _timeout(papel: Papel) -> int:
    """Classificador e juiz dão respostas curtas: se demorarem, algo deu errado."""
    return settings.llm_timeout if papel == "agente" else settings.llm_timeout_rapido


def criar_llm(
    papel: Papel = "agente", provedor: str | None = None, modelo: str | None = None
) -> BaseChatModel:
    """Cria o modelo de chat para o papel pedido, com timeout e limite de tokens do config.

    `modelo` substitui o modelo do .env (usado na avaliação para comparar modelos).
    Os imports ficam dentro de cada ramo para só carregar a biblioteca do provedor usado.
    """
    provedor = (provedor or settings.llm_provider).lower()

    if provedor == "anthropic":
        if not settings.anthropic_api_key:
            raise LLMNaoConfigurado("Defina ANTHROPIC_API_KEY no arquivo .env.")
        from langchain_anthropic import ChatAnthropic

        modelos = {
            "agente": settings.agent_model,
            "classificador": settings.classifier_model,
            "juiz": settings.judge_model,
        }
        modelo = modelo or modelos[papel]
        return ChatAnthropic(
            model=modelo,
            api_key=settings.anthropic_api_key,
            timeout=_timeout(papel),
            max_tokens=settings.llm_max_tokens,
            max_retries=1,
            **_opcoes_claude(modelo),
        )

    if provedor == "openai":
        if not settings.openai_api_key:
            raise LLMNaoConfigurado("Defina OPENAI_API_KEY no arquivo .env.")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=modelo or settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0,
            timeout=_timeout(papel),
            max_tokens=settings.llm_max_tokens,
            max_retries=1,
        )

    if provedor == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=modelo or settings.ollama_model,
            temperature=0,
            num_predict=settings.llm_max_tokens,
            client_kwargs={"timeout": _timeout(papel)},
        )

    raise ValueError(f"LLM_PROVIDER inválido: {provedor!r}. Use openai, anthropic ou ollama.")
