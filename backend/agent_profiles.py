"""Perfis estáticos v1. Identidade, dificuldade e estilo não são o executável UCI."""
from dataclasses import dataclass
from typing import Literal
from agent_personas import resolve_persona

DifficultyName = Literal['beginner', 'intermediate', 'advanced']
Style = Literal['balanced', 'aggressive', 'positional', 'tactical']


@dataclass(frozen=True)
class Difficulty:
    time: float
    nodes: int
    candidates: int
    quality_cp: int


# Orçamento de tempo E nós: vence o primeiro limite. CP = centésimos de peão.
DIFFICULTIES = {
    'beginner': Difficulty(0.15, 4000, 5, 150),
    'intermediate': Difficulty(0.35, 15000, 4, 75),
    'advanced': Difficulty(0.70, 50000, 4, 25),
}


@dataclass(frozen=True)
class AgentProfile:
    id: str
    display_name: str
    difficulty: DifficultyName
    style: Style
    description: str
    policy: str = 'stockfish_candidates_v1'
    version: int = 1
    persona_id: str = 'training'
    persona_version: int = 1
    inspiration: str | None = None

    def metadata(self) -> dict:
        try:
            persona = resolve_persona(self.persona_id, self.persona_version).metadata()
        except Exception:
            persona = None  # Apresentação indisponível nunca impede leitura/jogo.
        return {**{key: getattr(self, key) for key in ('id', 'display_name', 'difficulty', 'style', 'description', 'inspiration')},
                'profile_version': self.version, 'persona': persona}


PROFILES = {p.id: p for p in (
    AgentProfile('training_beginner', 'Treino inicial', 'beginner', 'balanced', 'Busca curta; pratica com alternativas razoáveis.'),
    AgentProfile('balanced', 'Equilibrado', 'intermediate', 'balanced', 'Prefere a melhor avaliação do motor.'),
    AgentProfile('aggressive', 'Agressivo', 'intermediate', 'aggressive', 'Favorece atividade e pressão dentro da janela de qualidade.'),
    AgentProfile('positional', 'Posicional', 'advanced', 'positional', 'Busca mais ampla; favorece desenvolvimento e segurança.'),
    AgentProfile('tactical', 'Tático', 'advanced', 'tactical', 'Busca mais ampla; favorece xeques e linhas concretas.'),
    AgentProfile('magnus_inspired', 'Perfil inspirado em Magnus', 'advanced', 'positional',
                 'Perfil educacional inspirado em Magnus: interpretação heurística do projeto, sem imitação fiel ou endosso.',
                 persona_id='structure', inspiration='Magnus'),
    AgentProfile('hans_inspired', 'Perfil inspirado em Hans', 'advanced', 'aggressive',
                 'Perfil educacional inspirado em Hans: interpretação heurística do projeto, sem imitação fiel ou endosso.',
                 persona_id='initiative', inspiration='Hans'),
    AgentProfile('judit_inspired', 'Perfil inspirado em Judit', 'advanced', 'tactical',
                 'Perfil educacional inspirado em Judit: interpretação heurística do projeto, sem imitação fiel ou endosso.',
                 persona_id='threats', inspiration='Judit'),
)}


# Definições v1 são imutáveis por contrato; mudanças exigem nova versão.
def resolve_profile(agent_id: str, version: int = 1) -> AgentProfile:
    if version != 1:
        raise KeyError("Versão de perfil desconhecida")
    # Alias mantido no armazenamento/resposta das Games legadas, sem reescrever dados.
    return PROFILES['balanced' if agent_id == 'stockfish' else agent_id]
