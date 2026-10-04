"""Árbitro: regras oficiais do xadrez, consultando só o índice `regras` (Leis da FIDE)."""

from langchain_core.language_models.chat_models import BaseChatModel

from agents.base import Agente, responder_com_documentos
from schemas import Resposta

AGENTE = Agente(
    nome="arbitro",
    indice="regras",
    papel=(
        "Árbitro, especialista nas Leis do Xadrez da FIDE. Explique as regras oficiais com "
        "precisão e, quando o trecho mostrar, cite o número do artigo (ex.: art. 3.8.2)."
    ),
)


def responder(pergunta: str, llm: BaseChatModel | None = None) -> Resposta:
    """Responde a uma dúvida de regras com base nas Leis da FIDE."""
    return responder_com_documentos(AGENTE, pergunta, llm)
