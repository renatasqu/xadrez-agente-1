"""Currículo do Professor: lições em ordem regras → notação → aberturas → tática → finais.

Cada lição é uma pergunta nossa, respondida a partir dos documentos pelo agente do índice
indicado (com fontes, juiz e checagem de saída, como qualquer resposta). Assim o conteúdo das
lições também vem só dos livros.

As associações curadas em conceitos.LICAO_CONCEITOS conectam lições a exercícios;
a validação pedagógica permanece no motor determinístico exercises.
"""

from dataclasses import dataclass

from schemas import Categoria

ORDEM_DOS_MODULOS = ["regras", "notação", "aberturas", "tática", "finais"]


@dataclass(frozen=True)
class Licao:
    """Uma lição: módulo, título, pergunta feita ao agente e índice consultado."""

    modulo: str
    titulo: str
    pergunta: str
    categoria: Categoria  # índice/agente que responde


LICOES: list[Licao] = [
    Licao("regras", "Como as peças se movem", "Como se movem o rei, a dama, a torre, o bispo e o cavalo?", "regras"),
    Licao("regras", "O roque", "Como funciona o roque?", "regras"),
    Licao("regras", "En passant", "O que é en passant?", "regras"),
    Licao("regras", "Xeque, xeque-mate e afogamento", "O que são xeque, xeque-mate e afogamento?", "regras"),
    Licao("notação", "Notação algébrica", "Como funciona a notação algébrica?", "regras"),
    Licao(
        "aberturas",
        "Centro e desenvolvimento",
        "Por que é importante controlar o centro e desenvolver as peças na abertura?",
        "fundamentos",
    ),
    Licao("aberturas", "Quando tirar a dama", "Devo tirar a dama cedo?", "fundamentos"),
    Licao("tática", "O garfo", "O que é um garfo?", "estrategia"),
    Licao("tática", "Cravada e espeto", "O que são a cravada e o espeto?", "estrategia"),
    Licao("tática", "Ataque descoberto", "O que é um ataque descoberto?", "estrategia"),
    Licao("finais", "Mate com rei e torre", "Como dar mate com rei e torre contra o rei sozinho?", "fundamentos"),
    Licao("finais", "A oposição", "O que é a oposição entre os reis?", "fundamentos"),
]
