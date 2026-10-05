"""Serviço determinístico de xadrez: python-chess + Stockfish, sem LLM/RAG.

FEN isolado não contém histórico de repetição. PV limitada a três plies; SAN inglês e UCI.
Scores são sempre das brancas, independentemente do lado a jogar.
Cada análise não terminal abre e fecha seu próprio processo UCI.
"""
import logging
import math
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import chess
import chess.engine

from config import settings

log = logging.getLogger(__name__)


class PosicaoInvalida(ValueError):
    """FEN sintaticamente inválido ou tabuleiro inconsistente."""


def tabuleiro_validado(fen: str) -> chess.Board:
    try:
        board = chess.Board(fen)
    except ValueError as error:
        raise PosicaoInvalida("FEN inválido") from error
    if not board.is_valid():
        raise PosicaoInvalida("FEN inválido")
    return board


def movimento_legal(fen: str, uci: str) -> chess.Move:
    """Valida candidato UCI no servidor, incluindo promoção explícita."""
    board = tabuleiro_validado(fen)
    try:
        move = chess.Move.from_uci(uci)
    except ValueError as error:
        raise ValueError("Movimento UCI inválido") from error
    if move not in board.legal_moves:
        raise ValueError("Movimento ilegal na posição")
    return move


def aplicar_movimento(fen: str, uci: str) -> str:
    board = tabuleiro_validado(fen)
    board.push(movimento_legal(fen, uci))
    return board.fen()


NOMES_DAS_PECAS = {
    chess.KING: "rei",
    chess.QUEEN: "dama",
    chess.ROOK: "torre",
    chess.BISHOP: "bispo",
    chess.KNIGHT: "cavalo",
    chess.PAWN: "peão",
}
CENTRO = {chess.D4, chess.E4, chess.D5, chess.E5}


class StockfishAusente(RuntimeError):
    """O executável do Stockfish não existe no caminho configurado."""


class ErroDoMotor(RuntimeError):
    """O Stockfish abriu, mas falhou durante a análise."""


@dataclass
class Analise:
    """Resultado do motor para uma posição. Pontos e mate são do ponto de vista das brancas."""

    fen: str
    lado: str  # "brancas" ou "pretas" (quem joga)
    melhor_lance: str | None = None  # SAN
    linha: list[str] = field(default_factory=list)  # linha principal em SAN (até 3 lances)
    pontos: int | None = None  # centipeões (100 = um peão de vantagem para as brancas)
    mate: int | None = None  # mate em N: positivo = brancas dão mate, negativo = pretas
    fim_de_jogo: str | None = None  # texto, se a partida já acabou nesta posição
    caracteristicas: list[str] = field(default_factory=list)  # do melhor lance, em português
    melhor_lance_uci: str | None = None
    linha_uci: list[str] = field(default_factory=list)
    profundidade: int | None = None
    perspectiva: str = "white"
    status: str = "ongoing"
    vencedor: str | None = None


def fim_de_jogo(tabuleiro: chess.Board) -> str | None:
    """Texto se a partida já terminou nesta posição (sem precisar do motor)."""
    if tabuleiro.is_checkmate():
        vencedor = "pretas" if tabuleiro.turn == chess.WHITE else "brancas"
        return f"A posição já é xeque-mate: as {vencedor} venceram."
    if tabuleiro.is_stalemate():
        return "A posição é de afogamento: o lado que joga não tem lance legal e não está em xeque. É empate."
    if tabuleiro.is_insufficient_material():
        return "Empate: nenhum dos lados tem material suficiente para dar xeque-mate."
    return None


def caracteristicas_do_lance(tabuleiro: chess.Board, lance: chess.Move) -> list[str]:
    """Fatos do lance calculados pelo python-chess, em português (usados na busca e no prompt)."""
    peca = tabuleiro.piece_at(lance.from_square)
    termos = [NOMES_DAS_PECAS[peca.piece_type]] if peca else []
    if tabuleiro.is_castling(lance):
        termos.append("roque")
    if tabuleiro.is_capture(lance):
        termos.append("captura")
    if lance.promotion:
        termos.append("promoção")
    if peca and peca.piece_type in (chess.KNIGHT, chess.BISHOP):
        fileira_inicial = 0 if peca.color == chess.WHITE else 7
        if chess.square_rank(lance.from_square) == fileira_inicial:
            termos.append("desenvolvimento")
    if lance.to_square in CENTRO:
        termos.append("centro")

    depois = tabuleiro.copy()
    depois.push(lance)
    if depois.is_checkmate():
        termos.append("xeque-mate")
        # Mate do corredor: torre ou dama dá mate na primeira fileira do adversário.
        fileira_do_rei = 7 if peca.color == chess.WHITE else 0
        if peca.piece_type in (chess.ROOK, chess.QUEEN) and chess.square_rank(lance.to_square) == fileira_do_rei:
            termos.append("mate do corredor")
    elif depois.is_check():
        termos.append("xeque")
    # Garfo: a peça que moveu ataca 2 ou mais peças adversárias valiosas (ou o rei).
    alvos = [
        depois.piece_at(casa)
        for casa in depois.attacks(lance.to_square)
        if depois.piece_at(casa) and depois.piece_at(casa).color != peca.color
    ] if peca else []
    if sum(1 for alvo in alvos if alvo.piece_type != chess.PAWN) >= 2:
        termos.append("garfo")
    return termos


def caminho_do_stockfish() -> str | None:
    """Caminho do executável, se existir (aceita caminho completo ou nome no PATH)."""
    caminho = settings.stockfish_path
    if Path(caminho).is_file():
        return caminho
    return shutil.which(caminho)


def abrir_motor() -> chess.engine.SimpleEngine:
    """Abre o Stockfish. Levanta StockfishAusente com instruções se ele não for encontrado."""
    caminho = caminho_do_stockfish()
    if caminho is None:
        raise StockfishAusente(
            f"Stockfish não encontrado em {settings.stockfish_path!r}. Instale com "
            "`brew install stockfish` (macOS) ou `apt install stockfish` (Linux), ou ajuste "
            "STOCKFISH_PATH no .env."
        )
    try:
        return chess.engine.SimpleEngine.popen_uci(caminho)
    except (OSError, chess.engine.EngineError) as erro:
        raise StockfishAusente(f"Não foi possível abrir o Stockfish em {caminho!r}: {erro}") from erro


def fechar_motor(motor: chess.engine.SimpleEngine) -> None:
    """Encerra o processo do Stockfish, mesmo que ele já tenha falhado."""
    try:
        motor.quit()
    except Exception:  # noqa: BLE001 - na limpeza, qualquer erro do quit é irrelevante
        pass
    finally:
        motor.close()  # fecha o transporte e mata o processo se o quit não bastou


def linha_validada(fen: str, lances: list[chess.Move]) -> list[str]:
    """Prefixo legal em SAN; para ao primeiro movimento inconsistente."""
    board = tabuleiro_validado(fen)
    linha = []
    for move in lances:
        if move not in board.legal_moves:
            log.warning("engine_error: PV ilegal descartada")
            break
        linha.append(board.san(move))
        board.push(move)
    return linha


def analisar_posicao(fen: str, tempo: float | None = None, *,
                     abrir: Callable[[], chess.engine.SimpleEngine] | None = None) -> Analise:
    """Roda o Stockfish na posição (tempo máximo em segundos, padrão do config)."""
    tabuleiro = tabuleiro_validado(fen)
    segundos = settings.stockfish_tempo if tempo is None else tempo
    if not math.isfinite(segundos) or segundos <= 0:
        raise ValueError("Tempo de análise deve ser positivo e finito")
    analise = Analise(fen=fen, lado="brancas" if tabuleiro.turn == chess.WHITE else "pretas")
    analise.fim_de_jogo = fim_de_jogo(tabuleiro)
    if analise.fim_de_jogo:
        if tabuleiro.is_checkmate():
            analise.status = "checkmate"
            analise.mate = 0
            analise.vencedor = "black" if tabuleiro.turn == chess.WHITE else "white"
        else:
            analise.status = "stalemate" if tabuleiro.is_stalemate() else "insufficient_material"
        return analise

    motor = (abrir or abrir_motor)()
    try:
        limite = chess.engine.Limit(time=segundos)
        info = motor.analyse(tabuleiro, limite)
    except (OSError, chess.engine.EngineError, TimeoutError) as erro:
        raise ErroDoMotor(str(erro)) from erro
    finally:
        fechar_motor(motor)  # guardrail: nunca deixar processo do Stockfish aberto

    try:
        placar = info["score"].white()
        analise.mate = placar.mate()
        analise.pontos = None if analise.mate is not None else placar.score()
        if analise.mate is None and analise.pontos is None:
            raise ValueError("Score ausente")
        moves = info.get("pv", [])[:3]
        analise.linha = linha_validada(fen, moves)
        if not analise.linha:
            raise ValueError("PV sem movimento legal")
        analise.linha_uci = [move.uci() for move in moves[:len(analise.linha)]]
        analise.melhor_lance = analise.linha[0]
        analise.melhor_lance_uci = analise.linha_uci[0]
        depth = info.get("depth")
        analise.profundidade = depth if type(depth) is int and depth >= 0 else None
        analise.caracteristicas = caracteristicas_do_lance(tabuleiro, moves[0])
    except (KeyError, ValueError, TypeError, AttributeError) as error:
        raise ErroDoMotor("Resultado inválido do motor") from error
    return analise


def estado_tabuleiro(board: chess.Board) -> dict:
    """Política local: encerra na terceira repetição ou cinquenta lances já atingidos."""
    status = ('checkmate' if board.is_checkmate() else 'stalemate' if board.is_stalemate()
              else 'insufficient_material' if board.is_insufficient_material()
              else 'repetition' if board.is_repetition(3) else 'fifty_move' if board.is_fifty_moves()
              else 'draw' if board.is_game_over() else 'check' if board.is_check() else 'playing')
    return dict(status=status, turn='white' if board.turn else 'black',
                winner=('black' if board.turn else 'white') if status == 'checkmate' else None,
                ended=status not in ('playing', 'check'), fen=board.fen())


def reconstruir_partida(fen_inicial: str, movimentos: list[str]) -> chess.Board:
    """Reconstrói histórico UCI legal sem persistência nem alteração das entradas."""
    board = tabuleiro_validado(fen_inicial)
    for uci in movimentos:
        if estado_tabuleiro(board)['ended']:
            raise ValueError('Partida encerrada')
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            raise ValueError('Movimento ilegal')
        board.push(move)
    return board


def estado_posicao(fen: str) -> dict:
    """FEN isolado não permite confirmar repetição."""
    return estado_tabuleiro(tabuleiro_validado(fen))


def lances_legais(fen_inicial: str, movimentos: list[str] | None = None) -> list[str]:
    board = reconstruir_partida(fen_inicial, movimentos or [])
    return [] if estado_tabuleiro(board)['ended'] else [m.uci() for m in board.legal_moves]


def aplicar_na_partida(fen_inicial: str, movimentos: list[str], uci: str) -> dict:
    return estado_tabuleiro(reconstruir_partida(fen_inicial, [*movimentos, uci]))


def escolher_lance(board: chess.Board, tempo: float | None = None) -> str:
    """Decisão UCI com histórico completo, prazo do protocolo e processo próprio."""
    segundos = settings.stockfish_tempo if tempo is None else tempo
    if not math.isfinite(segundos) or segundos <= 0 or segundos > 10:
        raise ValueError('Tempo de decisão deve estar entre zero e dez segundos')
    motor = abrir_motor()
    try:
        motor.timeout = 5.0
        result = motor.play(board.copy(stack=True), chess.engine.Limit(time=segundos))
        if result.move is None:
            raise ErroDoMotor('Motor não retornou candidato')
        return result.move.uci()
    finally:
        fechar_motor(motor)
