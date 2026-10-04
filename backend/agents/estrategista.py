"""Estrategista: táticas e ideias por trás dos lances, consultando o índice `estrategia` (Regis)."""

from langchain_core.language_models.chat_models import BaseChatModel

from agents.base import Agente, responder_com_documentos
from schemas import Resposta

AGENTE = Agente(
    nome="estrategista",
    indice="estrategia",
    papel=(
        "Estrategista, que explica táticas e combinações (garfo, cravada, espeto, ataque "
        "descoberto, sobrecarga, desvio, padrões de mate) e a ideia por trás de cada lance, "
        "em linguagem simples para um iniciante."
    ),
)


def responder(pergunta: str, llm: BaseChatModel | None = None) -> Resposta:
    """Responde a uma dúvida de tática com base no curso de Dave Regis."""
    return responder_com_documentos(AGENTE, pergunta, llm)
