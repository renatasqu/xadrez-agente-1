"""Catálogo V1 versionado: associações curadas, nunca IDs escolhidos pelo LLM."""

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class Conceito:
    exercise_ids: tuple[str, ...] = ()
    demonstration_key: str | None = None
    lesson_id: int | None = None
    source_reference: str | None = None


CONCEITOS = {
    "movimento_cavalo": Conceito(("a1-cavalo",), "cavalo", 1, "3.6"),
    "roque": Conceito(("a2-roque-pequeno", "a2-roque-grande", "a2-roque-bloqueado"), "roque", 2, "3.8.2"),
    "garfo": Conceito(("a3-garfo-cavalo",), lesson_id=8),
    "evitar_perda_material": Conceito(("e1-material-seguro",)),
    "desenvolvimento": Conceito(lesson_id=6),
    "controle_centro": Conceito(lesson_id=6),
    "valor_pecas": Conceito(),
    "xeque": Conceito(demonstration_key="xeque", lesson_id=4, source_reference="3.9"),
    "mate": Conceito(demonstration_key="xeque_mate", lesson_id=4, source_reference="5.1.1"),
    "en_passant": Conceito(demonstration_key="en_passant", lesson_id=3, source_reference="3.7.3.1–3.7.3.2"),
    "promocao": Conceito(demonstration_key="promocao", source_reference="3.7.3.3–3.7.3.5"),
    "afogamento": Conceito(demonstration_key="afogamento", lesson_id=4, source_reference="5.2.1"),
    "movimento_pecas": Conceito(lesson_id=1, source_reference="3.1–3.8"),
}

LICAO_CONCEITOS = {
    1: ["movimento_pecas", "movimento_cavalo"], 2: ["roque"], 3: ["en_passant"],
    4: ["xeque", "mate", "afogamento"], 6: ["controle_centro", "desenvolvimento"],
    8: ["garfo"], 11: ["mate"],
}


def normalizar(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower().strip()


def resolver(pergunta: str, categoria: str) -> list[str]:
    """Reconhecimento conservador após categoria/segurança já resolvidas."""
    texto = normalizar(pergunta)
    if categoria == "regras":
        padroes = {
            "roque": r"\broque\b", "en_passant": r"\ben passant\b",
            "promocao": r"\b(promocao|promover)\b", "afogamento": r"\bafogamento\b",
            "mate": r"\bmate\b", "xeque": r"\bxeque\b(?![- ]mate)",
        }
        encontrados = [id for id, padrao in padroes.items() if re.search(padrao, texto)]
        if not encontrados and re.search(r"\bcavalos?\b", texto) and re.search(r"\b(move|movem|movimento|movimentos|anda|funciona|joga)\b", texto):
            encontrados = ["movimento_cavalo"]
        return encontrados
    if categoria == "estrategia" and re.search(r"\bgarfos?\b", texto):
        return ["garfo"]
    if categoria == "fundamentos":
        return [id for id, padrao in {
            "desenvolvimento": r"\b(desenvolvimento|desenvolver)\b",
            "controle_centro": r"\bcentro\b", "valor_pecas": r"\bvalor das pecas\b",
        }.items() if re.search(padrao, texto)]
    return []


def exercicios(ids: list[str]) -> list[str]:
    return list(dict.fromkeys(ex for id in ids for ex in CONCEITOS[id].exercise_ids))


def associar(resposta, ids: list[str]):
    return resposta.model_copy(update={"concept_ids": list(ids), "related_exercise_ids": exercicios(ids)})


def conceito_do_exercicio(exercise_id: str) -> str | None:
    return next((id for id, conceito in CONCEITOS.items() if exercise_id in conceito.exercise_ids), None)
