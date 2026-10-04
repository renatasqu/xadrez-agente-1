"""Demonstrações no tabuleiro para as regras: posições e lances escritos aqui, no código.

O LLM nunca escreve uma demonstração. Para as regras, o tema é detectado na pergunta
(palavras-chave) e a demonstração vem desta lista; para as análises, o Analista usa a linha
principal do Stockfish. Toda demonstração passa por guardrails.validar_demonstracao antes de
sair (FEN válido e cada lance legal, em ordem).

Os lances precisam alternar brancas e pretas para serem legais; nas demonstrações de uma peça,
o rei preto sozinho faz os lances do meio (a descrição avisa).
"""

import re
import unicodedata

from schemas import Demonstracao

INICIAL = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
REI_PRETO = " Os lances das pretas são só do rei preto, para a vez voltar às brancas."

DEMONSTRACOES: dict[str, Demonstracao] = {
    "roque": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1",
        lances=["O-O"],
        descricao="Roque pequeno: o rei anda duas casas em direção à torre (e1→g1) e a torre "
        "passa para o outro lado dele (h1→f1). Conta como um lance só.",
    ),
    "roque_grande": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1",
        lances=["O-O-O"],
        descricao="Roque grande: o rei anda duas casas em direção à torre da dama (e1→c1) e a "
        "torre passa para o outro lado dele (a1→d1).",
    ),
    "en_passant": Demonstracao(
        fen_inicial="4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1",
        lances=["d5", "exd6"],
        descricao="O peão preto avança duas casas (d7→d5) e para ao lado do peão branco. No lance "
        "seguinte, o peão branco captura en passant: vai para d6, como se o preto tivesse andado "
        "só uma casa, e o peão de d5 sai do tabuleiro.",
    ),
    "promocao": Demonstracao(
        fen_inicial="8/P3k3/8/8/8/8/8/4K3 w - - 0 1",
        lances=["a8=Q"],
        descricao="O peão chega à última fileira e é promovido: vira dama (poderia virar torre, "
        "bispo ou cavalo, à escolha do jogador).",
    ),
    "cavalo": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/1N2K3 w - - 0 1",
        lances=["Nc3", "Kf7", "Nd5", "Kg6", "Nb6"],
        descricao="O cavalo anda em \"L\": duas casas numa direção e uma para o lado, e pode "
        "pular por cima das outras peças." + REI_PRETO,
    ),
    "bispo": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/2B1K3 w - - 0 1",
        lances=["Bf4", "Kd7", "Bb8", "Kc6", "Be5"],
        descricao="O bispo anda na diagonal, quantas casas quiser, sem pular peças; fica sempre na "
        "casa da mesma cor." + REI_PRETO,
    ),
    "torre": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        lances=["Ra4", "Kd7", "Rh4", "Kc6", "Rh8"],
        descricao="A torre anda em linha reta, na coluna ou na fileira, quantas casas quiser, sem "
        "pular peças." + REI_PRETO,
    ),
    "dama": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/3QK3 w - - 0 1",
        lances=["Qd4", "Kf7", "Qa4", "Kg6", "Qd7"],
        descricao="A dama junta a torre e o bispo: anda em linha reta ou na diagonal, quantas "
        "casas quiser, sem pular peças." + REI_PRETO,
    ),
    "rei": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/4K3 w - - 0 1",
        lances=["Kd2", "Kd7", "Ke3", "Ke6", "Kf4"],
        descricao="O rei anda uma casa em qualquer direção e nunca pode ir para uma casa atacada.",
    ),
    "peao": Demonstracao(
        fen_inicial="4k3/8/2p5/8/8/8/3P4/4K3 w - - 0 1",
        lances=["d4", "Ke7", "d5", "Kd6", "dxc6"],
        descricao="O peão anda para a frente: duas casas no primeiro lance (d2→d4), depois uma. "
        "Ele captura na diagonal (d5×c6)." + REI_PRETO,
    ),
    "xeque": Demonstracao(
        fen_inicial="4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        lances=["Ra8+", "Kd7"],
        descricao="A torre ataca o rei preto: é xeque. As pretas são obrigadas a sair do xeque; "
        "aqui o rei foge para d7.",
    ),
    "xeque_mate": Demonstracao(
        fen_inicial=INICIAL,
        lances=["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"],
        descricao="Mate do pastor: a dama, protegida pelo bispo, captura em f7 e ataca o rei, que "
        "não tem como fugir, bloquear nem capturar. É xeque-mate.",
    ),
    "afogamento": Demonstracao(
        fen_inicial="7k/8/6K1/5Q2/8/8/8/8 w - - 0 1",
        lances=["Qf7"],
        descricao="Depois de Df7 o rei preto não está em xeque, mas não tem nenhum lance legal: é "
        "afogamento, e a partida termina empatada.",
    ),
    "notacao": Demonstracao(
        fen_inicial=INICIAL,
        lances=["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
        descricao="Cada lance é a letra da peça (em inglês: K rei, Q dama, R torre, B bispo, N "
        "cavalo; o peão não tem letra) e a casa de chegada: e4, Nf3 (em português, Cf3), Bb5 (Bb5).",
    ),
}

# Ordem importa: temas específicos antes das peças ("en passant" fala de peão, "roque" de rei).
TEMAS: list[tuple[str, re.Pattern]] = [
    ("en_passant", re.compile(r"en passant|\be\.p\.")),
    ("promocao", re.compile(r"promo[cv]|promover|coroa[rç]")),
    ("roque_grande", re.compile(r"roque (grande|longo)|o-o-o")),
    ("roque", re.compile(r"\broque|\brocar")),
    ("afogamento", re.compile(r"afoga")),
    ("xeque_mate", re.compile(r"xeque[- ]?mate|\bmate\b")),
    ("xeque", re.compile(r"\bxeque")),
    ("notacao", re.compile(r"nota[cç]ao|\banota")),
    ("cavalo", re.compile(r"\bcavalos?\b")),
    ("bispo", re.compile(r"\bbispos?\b")),
    ("torre", re.compile(r"\btorres?\b")),
    ("dama", re.compile(r"\b(damas?|rainhas?)\b")),
    ("peao", re.compile(r"\bpeao\b|\bpeoes\b")),
    ("rei", re.compile(r"\breis?\b")),
]


def _normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return sem_acento.lower()


def tema_da_pergunta(pergunta: str) -> str | None:
    """Tema de regra da pergunta, se houver uma demonstração para ele."""
    texto = _normalizar(pergunta)
    return next((tema for tema, padrao in TEMAS if padrao.search(texto)), None)


def para_pergunta(pergunta: str) -> Demonstracao | None:
    """Demonstração curada para a pergunta (None se nenhum tema bater)."""
    tema = tema_da_pergunta(pergunta)
    return DEMONSTRACOES[tema] if tema else None
