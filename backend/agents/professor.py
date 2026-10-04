"""Professor: fundamentos do xadrez, consultando o índice `fundamentos` (Capablanca e Staunton).

Lições e progresso usam SQLite. Conceitos relacionam lições a exercícios curados;
o Professor explica fundamentos, sem validar exercícios nem escolher IDs.
"""

from langchain_core.language_models.chat_models import BaseChatModel

from agents.base import Agente, responder_com_documentos
from schemas import Resposta

AGENTE = Agente(
    nome="professor",
    indice="fundamentos",
    papel=(
        "Professor de xadrez para iniciantes. Ensine os fundamentos (peças e seus movimentos, "
        "valor das peças, notação, princípios de abertura, finais básicos) de forma didática, "
        "passo a passo e com exemplos simples."
    ),
)


def responder(pergunta: str, llm: BaseChatModel | None = None) -> Resposta:
    """Responde a uma dúvida de fundamentos com base nos livros de Capablanca e Staunton."""
    return responder_com_documentos(AGENTE, pergunta, llm)
