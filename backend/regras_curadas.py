"""Referências FIDE 2023 fixas; resumos curados, sem busca vetorial nem reingestão.

Perguntas abertas continuam no RAG. Não infere legalidade de uma posição.
Fonte oficial: https://handbook.fide.com/chapter/E012023
"""

import re
from conceitos import normalizar
from config import TITULOS
from schemas import Fonte

REFERENCIAS = {
    "movimento_pecas": ("3.1–3.8", "Bispo: diagonais. Torre: colunas/fileiras. Dama: ambas. Essas peças não saltam. Cavalo: em L, saltando peças. Rei: uma casa, sem entrar em ataque. Peão: avança sem capturar e captura na diagonal; pode avançar duas casas inicialmente se o caminho estiver livre."),
    "movimento_cavalo": ("3.6", "O cavalo se move em L: duas casas em uma direção e uma perpendicular. Pode saltar peças; não pode ocupar casa de peça própria nem deixar o próprio rei em xeque."),
    "roque": ("3.8.2–3.8.2.2", "O roque move rei e torre no mesmo lance: o rei avança duas casas em direção à torre, que vai à casa atravessada. Exige direitos de roque, caminho livre e rei sem xeque; as casas atravessada e de destino do rei não podem estar atacadas. Mover o rei ou a torre correspondente perde o direito, mesmo se voltarem."),
    "en_passant": ("3.7.3.1–3.7.3.2", "En passant captura o peão adversário que acabou de avançar duas casas ao lado do seu peão, como se tivesse avançado uma. Só vale imediatamente no lance seguinte."),
    "promocao": ("3.7.3.3–3.7.3.5", "Na última fileira, o peão deve virar dama, torre, bispo ou cavalo da mesma cor, com efeito imediato; a escolha independe das peças antes capturadas."),
    "xeque": ("3.9.1–3.9.2", "Xeque significa rei atacado. Nenhum lance pode deixar ou colocar o próprio rei em xeque."),
    "mate": ("5.1.1", "Xeque-mate encerra a partida: o rei está atacado e não existe lance legal que elimine o xeque."),
    "afogamento": ("5.2.1", "Afogamento encerra a partida empatada: o jogador da vez não tem lance legal e seu rei não está em xeque."),
}


def fontes_para(pergunta: str, ids: list[str]) -> list[Fonte]:
    """Apenas pedidos de definição básicos cobertos integralmente pelos resumos."""
    texto = normalizar(pergunta).rstrip("?.!")
    if not re.fullmatch(r"(como funciona|o que e) (o |a |um |uma )?(cavalo|roque|en passant|promocao|xeque|xeque-mate|xeque mate|mate|afogamento)", texto):
        # A primeira lição é um pedido controlado sobre todos os movimentos.
        if texto != "como se movem o rei, a dama, a torre, o bispo e o cavalo":
            return []
        ids = ["movimento_pecas"]
    return [Fonte(documento="Laws_of_Chess-2023.pdf", titulo=TITULOS["Laws_of_Chess-2023.pdf"],
                  local=f"FIDE 2023, art. {REFERENCIAS[id][0]}",
                  trecho="Resumo curado: " + REFERENCIAS[id][1]) for id in ids if id in REFERENCIAS]
