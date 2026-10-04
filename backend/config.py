"""Configurações do projeto, lidas do arquivo .env com pydantic-settings."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Pasta do backend (onde este arquivo está)
BASE_DIR = Path(__file__).resolve().parent

# Mapeamento arquivo (PDF ou TXT) -> índice (coleção no ChromaDB)
DOCUMENTOS: dict[str, str] = {
    "Laws_of_Chess-2023.pdf": "regras",
    "capablanca_chess_fundamentals.txt": "fundamentos",
    "staunton_blue_book.txt": "fundamentos",
    "regis_tactics.pdf": "estrategia",
    "lasker_manual.pdf": "estrategia",
}

# Nomes legíveis usados nas citações de fonte
TITULOS: dict[str, str] = {
    "Laws_of_Chess-2023.pdf": "FIDE Laws of Chess (FIDE, 2023)",
    "capablanca_chess_fundamentals.txt": "Chess Fundamentals (J. R. Capablanca)",
    "staunton_blue_book.txt": "The Blue Book of Chess (H. Staunton, ed. revisada 1910)",
    "regis_tactics.pdf": "Ten Steps to Learn Chess Tactics and Combinations (D. Regis)",
    "lasker_manual.pdf": "Lasker's Manual of Chess (E. Lasker)",
}

# Autores, mostrados no bloco "Onde ler"
AUTORES: dict[str, str] = {
    "Laws_of_Chess-2023.pdf": "FIDE",
    "capablanca_chess_fundamentals.txt": "J. R. Capablanca",
    "staunton_blue_book.txt": "H. Staunton",
    "regis_tactics.pdf": "D. Regis",
    "lasker_manual.pdf": "E. Lasker",
}

INDICES: list[str] = sorted(set(DOCUMENTOS.values()))

# Livros com muitas partidas transcritas: na ingestão, os chunks que são quase só listas de
# lances são descartados. No Staunton isso melhorou a busca (hit@4 de fundamentos 5/12 -> 7/12);
# no Capablanca não fez diferença, então ele fica completo para manter seus comentários.
DOCUMENTOS_COM_PARTIDAS: set[str] = {"staunton_blue_book.txt"}


class Settings(BaseSettings):
    """Variáveis de ambiente do projeto (valores padrão entre parênteses)."""

    model_config = SettingsConfigDict(
        env_file=(BASE_DIR.parent / ".env", BASE_DIR / ".env"),
        extra="ignore",
    )

    # LLM
    llm_provider: str = "anthropic"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    # Modelos Claude por papel: o classificador do roteador faz uma tarefa simples e rápida;
    # os agentes redigem a resposta a partir dos trechos.
    classifier_model: str = "claude-haiku-4-5-20251001"
    agent_model: str = "claude-sonnet-5-5"
    judge_model: str = "claude-haiku-4-5-20251001"  # juiz de fundamentação (guardrails)
    anthropic_effort: str = "low"  # low | medium | high (ignorado pelo Haiku, que não aceita)
    ollama_model: str = "llama3.1"
    llm_timeout: int = 60  # segundos, agentes (redigem respostas longas)
    llm_timeout_rapido: int = 15  # segundos, classificador e juiz (respostas curtas)
    # O Claude Sonnet 5.5 sempre "pensa" antes de responder, e o raciocínio conta em max_tokens;
    # 800 cortaria a resposta no meio. 4000 ainda limita o custo de cada chamada.
    llm_max_tokens: int = 4000

    # RAG. Na Fase 2, o multilingual-e5-base entregou o trecho certo em 14/18 perguntas contra
    # 9/18 do MiniLM com o limiar da época (ver eval/comparar_embeddings.py). Os scores do e5
    # ficam concentrados entre ~0.72 e ~0.83; 0.79 deixa passar todas as perguntas válidas
    # testadas. Perguntas fora do tema são barradas também pelo roteador (Fase 3).
    min_score: float = 0.79
    embedding_model: str = "intfloat/multilingual-e5-base"
    # O e5 foi treinado com estes prefixos; sem eles a busca piora.
    prefixo_consulta: str = "query: "
    prefixo_documento: str = "passage: "
    docs_dir: Path = BASE_DIR / "docs"
    chroma_dir: Path = BASE_DIR / "chroma"

    # Guardrails (Fase 4)
    max_pergunta: int = 500  # caracteres
    max_fen: int = 100  # caracteres (um FEN real tem no máximo ~90)
    max_resposta: int = 3000  # caracteres; acima disso a resposta é cortada no fim de uma frase
    verificar_fundamentacao: bool = True  # juiz confere se a resposta está nos trechos
    # Registro das ações dos guardrails (JSONL, sem o texto das perguntas), contado na Fase 8.
    log_guardrails: Path = BASE_DIR / "logs" / "guardrails.jsonl"

    # API (Fase 6)
    timeout_requisicao: float = 30.0  # segundos; uma análise completa leva ~12-17 s
    rate_limit: str = "20/minute"  # por IP, no formato do slowapi
    cors_origens: list[str] = ["http://localhost:5173"]
    admin_token: str = ""  # vazio = POST /ingest desativado
    db_progresso: Path = BASE_DIR / "progresso.sqlite"  # progresso das lições (id anônimo)
    aquecer_na_inicializacao: bool = True  # carregar embeddings e ChromaDB ao subir a API

    # Stockfish
    stockfish_path: str = "/opt/homebrew/bin/stockfish"
    stockfish_tempo: float = 1.0  # segundos por análise


settings = Settings()
