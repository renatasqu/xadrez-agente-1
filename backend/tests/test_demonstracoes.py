"""Demonstrações no tabuleiro: curadas no código, sempre validadas com python-chess."""

import chess
import pytest

import agents.analista as analista
import agents.base as base
import agents.router as router
import guardrails
from agents.demonstracoes import DEMONSTRACOES, tema_da_pergunta
from schemas import Classificacao, Demonstracao, RespostaLLM, Verificacao
from tests.test_agentes import LLMFalso, trecho


def jogar(demo: Demonstracao) -> tuple[chess.Board, list[chess.Move]]:
    """Joga a demonstração e devolve o tabuleiro final e os lances (erro se algum for ilegal)."""
    tabuleiro = chess.Board(demo.fen_inicial)
    lances = []
    for san in demo.lances:
        lance = tabuleiro.parse_san(san)
        lances.append(lance)
        tabuleiro.push(lance)
    return tabuleiro, lances


@pytest.mark.parametrize("tema", sorted(DEMONSTRACOES))
def test_toda_demonstracao_curada_e_legal(tema):
    demo = DEMONSTRACOES[tema]
    assert chess.Board(demo.fen_inicial).is_valid()
    jogar(demo)  # parse_san lança erro se algum lance for ilegal
    validada = guardrails.validar_demonstracao(demo)
    assert validada is not None and validada.lances == demo.lances and demo.descricao


def test_roque_e_roque_de_verdade():
    for tema, lado in [("roque", chess.G1), ("roque_grande", chess.C1)]:
        demo = DEMONSTRACOES[tema]
        tabuleiro = chess.Board(demo.fen_inicial)
        lance = tabuleiro.parse_san(demo.lances[0])
        assert tabuleiro.is_castling(lance) and lance.to_square == lado


def test_en_passant_e_en_passant_de_verdade():
    demo = DEMONSTRACOES["en_passant"]
    tabuleiro = chess.Board(demo.fen_inicial)
    tabuleiro.push_san(demo.lances[0])
    assert tabuleiro.is_en_passant(tabuleiro.parse_san(demo.lances[1]))


def test_promocao_vira_dama():
    _, lances = jogar(DEMONSTRACOES["promocao"])
    assert lances[0].promotion == chess.QUEEN


def test_mate_termina_em_mate_e_afogamento_em_afogamento():
    assert jogar(DEMONSTRACOES["xeque_mate"])[0].is_checkmate()
    assert jogar(DEMONSTRACOES["afogamento"])[0].is_stalemate()
    tabuleiro = chess.Board(DEMONSTRACOES["xeque"].fen_inicial)
    tabuleiro.push_san(DEMONSTRACOES["xeque"].lances[0])
    assert tabuleiro.is_check()


@pytest.mark.parametrize(
    "tema,peca",
    [("cavalo", chess.KNIGHT), ("bispo", chess.BISHOP), ("torre", chess.ROOK), ("dama", chess.QUEEN),
     ("rei", chess.KING), ("peao", chess.PAWN)],
)
def test_demonstracao_da_peca_move_essa_peca(tema, peca):
    demo = DEMONSTRACOES[tema]
    tabuleiro = chess.Board(demo.fen_inicial)
    for i, san in enumerate(demo.lances):
        lance = tabuleiro.parse_san(san)
        if i % 2 == 0:  # lances das brancas
            assert tabuleiro.piece_at(lance.from_square).piece_type == peca
        tabuleiro.push(lance)


@pytest.mark.parametrize(
    "pergunta,tema",
    [
        ("O que é en passant?", "en_passant"),  # fala de peão, mas o tema é en passant
        ("Como funciona a promoção do peão?", "promocao"),
        ("Como é o roque grande?", "roque_grande"),
        ("Como funciona o roque?", "roque"),  # fala de rei e torre, mas o tema é roque
        ("O que é afogamento?", "afogamento"),
        ("O que é xeque-mate?", "xeque_mate"),
        ("O que é xeque?", "xeque"),
        ("Como funciona a notação algébrica?", "notacao"),
        ("Como funciona o cavalo?", "cavalo"),
        ("Como se move a rainha?", "dama"),
        ("Como anda o peão?", "peao"),
        ("Como o rei se move?", "rei"),
        ("Qual o valor de cada peça?", None),
        ("O que é um gambito?", None),
    ],
)
def test_tema_da_pergunta(pergunta, tema):
    assert tema_da_pergunta(pergunta) == tema


@pytest.mark.parametrize(
    "demo",
    [
        Demonstracao(fen_inicial="isto não é FEN", lances=["e4"], descricao="x"),
        Demonstracao(fen_inicial="8/8/8/8/8/8/8/8 w - - 0 1", lances=["Kd2"], descricao="sem reis"),
        Demonstracao(fen_inicial=chess.STARTING_FEN, lances=["e5"], descricao="ilegal"),
        Demonstracao(fen_inicial=chess.STARTING_FEN, lances=["e4", "e4"], descricao="fora de ordem"),
        Demonstracao(fen_inicial=chess.STARTING_FEN, lances=[], descricao="vazia"),
    ],
)
def test_demonstracao_invalida_e_descartada(demo):
    assert guardrails.validar_demonstracao(demo) is None
    assert ("saida", "demonstracao_invalida") in set(guardrails.resumo_do_log())


def test_validacao_normaliza_para_san():
    demo = Demonstracao(fen_inicial=chess.STARTING_FEN, lances=["e2e4", "e7e5", "g1f3"], descricao="uci")
    assert guardrails.validar_demonstracao(demo).lances == ["e4", "e5", "Nf3"]


@pytest.fixture
def buscas(monkeypatch):
    monkeypatch.setattr(router, "buscar", lambda indice, pergunta: [trecho(1)])
    monkeypatch.setattr(base, "buscar", lambda indice, pergunta: [trecho(1)])


def classificador(categoria: str) -> LLMFalso:
    return LLMFalso(*[Classificacao(motivo="t", categoria=categoria)] * 2)


def agente(texto="Resposta do livro.") -> LLMFalso:
    return LLMFalso(RespostaLLM(resposta=texto, trechos_usados=[1], confianca=0.9))


def test_resposta_do_arbitro_traz_a_demonstracao(buscas):
    resposta = router.responder("Como funciona o roque?", llm_classificador=classificador("regras"), llm_agente=agente())
    assert resposta.agente == "arbitro" and resposta.demonstracao.lances == ["O-O"]


def test_notacao_do_professor_tambem_traz(buscas, monkeypatch):
    monkeypatch.setattr(router, "ajustar_categoria", lambda pergunta, categoria: categoria)
    resposta = router.responder("Explique a notação", llm_classificador=classificador("fundamentos"), llm_agente=agente())
    assert resposta.agente == "professor" and resposta.demonstracao.lances[0] == "e4"


@pytest.mark.parametrize(
    "pergunta,categoria",
    [("O que é um garfo com o cavalo?", "estrategia"), ("Qual a melhor casa para o cavalo na abertura?", "fundamentos")],
)
def test_outros_agentes_nao_recebem_demonstracao(buscas, pergunta, categoria):
    resposta = router.responder(pergunta, llm_classificador=classificador(categoria), llm_agente=agente())
    assert resposta.agente != "arbitro" and resposta.demonstracao is None


def test_nao_encontrei_nao_tem_demonstracao(buscas):
    agente_vazio = LLMFalso(*[RespostaLLM(resposta=base.NAO_ENCONTREI, trechos_usados=[], confianca=0)] * 3)
    resposta = router.responder("Como funciona o roque?", llm_classificador=classificador("regras"), llm_agente=agente_vazio)
    assert resposta.demonstracao is None


def test_juiz_nao_tira_a_demonstracao_junto_com_a_resposta(buscas):
    resposta = router.responder("Como funciona o roque?", llm_classificador=classificador("regras"), llm_agente=agente())
    julgada = guardrails.aplicar_verificacao(resposta, Verificacao(motivo="t", sustentada="nao"))
    assert julgada.demonstracao is None


def test_analise_usa_a_linha_do_stockfish(monkeypatch):
    fen = "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1"
    monkeypatch.setattr(analista, "analisar_posicao", lambda f: analista.Analise(
        fen=fen, lado="brancas", melhor_lance="Nc7+", linha=["Nc7+", "Kd7", "Nxa8"], pontos=0,
    ))
    monkeypatch.setattr(analista, "buscar", lambda indice, consulta: [])
    demo = analista.responder("?", fen=fen, llm=LLMFalso()).demonstracao
    assert demo.fen_inicial == fen and demo.lances == ["Nc7+", "Kd7", "Nxa8"]
    assert "Stockfish" in demo.descricao
