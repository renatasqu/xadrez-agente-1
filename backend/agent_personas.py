"""Apresentação pedagógica local. Sem engine, persistência, ferramentas ou LLM."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Persona:
    id: str
    version: int
    tone: str
    focus: str
    question: str

    def metadata(self) -> dict:
        return {'id': self.id, 'version': self.version, 'tone': self.tone, 'focus': self.focus}


# Interpretações criativas do produto, sem atribuição de personalidade real.
PERSONAS = {
    'training': Persona('training', 1, 'didático', 'regras e respostas legais', 'Qual resposta legal você considera agora?'),
    'structure': Persona('structure', 1, 'analítico', 'estrutura e desenvolvimento', 'Como esse lance mudou a coordenação das peças?'),
    'initiative': Persona('initiative', 1, 'direto', 'iniciativa e respostas concretas', 'Qual resposta do adversário merece atenção?'),
    'threats': Persona('threats', 1, 'energético', 'ameaças concretas', 'Confira os xeques e capturas disponíveis na posição.'),
}


def resolve_persona(persona_id: str, version: int) -> Persona:
    if version != 1:
        raise KeyError('Versão de persona desconhecida')
    return PERSONAS[persona_id]


@dataclass(frozen=True)
class MoveFacts:
    """Somente fatos do lance já persistido. Nenhuma referência mutável à Game."""
    uci: str
    san: str
    capture: bool
    check: bool
    castling: bool
    promotion: bool
    terminal: bool
    winner: str | None


def render_comment(persona: Persona, facts: MoveFacts) -> str:
    parts = [f'Lance oficial: {facts.san}.']
    if facts.castling: parts.append('Foi realizado um roque.')
    if facts.promotion: parts.append('O peão foi promovido.')
    if facts.capture: parts.append('Houve captura.')
    if facts.terminal:
        parts.append('A posição é de xeque-mate.' if facts.winner else 'A partida terminou empatada.')
    elif facts.check:
        parts.append('O rei adversário está em xeque.')
    if not facts.terminal:
        parts.append(f'Foco pedagógico: {persona.focus}.')
        parts.append(persona.question)
    return ' '.join(parts)
