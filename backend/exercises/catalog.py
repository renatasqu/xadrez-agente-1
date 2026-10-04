"""Catálogo mínimo: somente posições iniciais de demonstrações curadas."""

from agents.demonstracoes import DEMONSTRACOES

from .models import AnswerPositionQuestionGoal, AvoidMaterialLossGoal, Exercise, KnightForkGainGoal, PieceRef, ReachLegalSquareGoal


def demonstration_position(theme: str) -> str:
    """Resolve explicitamente a posição inicial, sem reproduzir Demonstracao.lances."""
    return DEMONSTRACOES[theme].fen_inicial


CATALOG = {
    "e1-material-seguro": Exercise(
        id="e1-material-seguro",
        prompt="Encontre um lance que evite perder material nos próximos três plies.",
        fen="2r1k3/8/8/8/8/2N5/8/4K3 w - - 0 1",
        goal=AvoidMaterialLossGoal(),
    ),
    "a3-garfo-cavalo": Exercise(
        id="a3-garfo-cavalo",
        prompt="Crie um garfo com o cavalo de b5 e capture um alvo para ganhar pelo menos 3 pontos materiais.",
        fen="r3k3/8/8/1N3r2/8/8/8/4K2R w - - 0 1",
        goal=KnightForkGainGoal(piece=PieceRef(square="b5", color="white"), min_material_gain=3),
    ),
    "a1-cavalo": Exercise(
        id="a1-cavalo", prompt="Mova o cavalo de b1 para qualquer casa legal.",
        fen=demonstration_position("cavalo"),
        goal=ReachLegalSquareGoal(piece=PieceRef(square="b1", color="white")),
    ),
    "a2-roque-pequeno": Exercise(
        id="a2-roque-pequeno", prompt="As brancas podem fazer roque pequeno?",
        fen=demonstration_position("roque"),
        goal=AnswerPositionQuestionGoal(side="kingside"),
    ),
    "a2-roque-grande": Exercise(
        id="a2-roque-grande", prompt="As brancas podem fazer roque grande?",
        fen=demonstration_position("roque_grande"),
        goal=AnswerPositionQuestionGoal(side="queenside"),
    ),
    "a2-roque-bloqueado": Exercise(
        id="a2-roque-bloqueado", prompt="As brancas podem fazer roque pequeno nesta posição?",
        fen=demonstration_position("notacao"),
        goal=AnswerPositionQuestionGoal(side="kingside"),
    ),
}
