"""Compara modelos de embeddings e configurações de busca num conjunto fixo de perguntas.

Para cada configuração (modelo x glossário x documentos do índice fundamentos) mede:
- hit@4: em quantas perguntas algum dos 4 primeiros trechos é o trecho certo;
- MRR: média de 1/posição do primeiro trecho certo (1.0 = sempre em 1º);
- separação: menor score do 1º trecho em perguntas válidas x maior score em perguntas fora
  do tema (serve para escolher o MIN_SCORE).

Não altera o ChromaDB: os chunks são gerados e comparados em memória.
Uso: cd backend && python eval/comparar_embeddings.py
"""

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import settings  # noqa: E402
from ingest import eh_lista_de_lances, preparar_chunks  # noqa: E402
from retrieval import expandir_pergunta  # noqa: E402


@dataclass(frozen=True)
class Modelo:
    nome: str
    prefixo_consulta: str = ""
    prefixo_documento: str = ""


MODELOS = [
    Modelo("paraphrase-multilingual-MiniLM-L12-v2"),
    Modelo("intfloat/multilingual-e5-base", "query: ", "passage: "),
]

# (índice, pergunta, regex que identifica o trecho certo)
PERGUNTAS = [
    ("regras", "Como funciona o roque?", r"towards the rook"),
    ("regras", "O que é en passant?", r"just advanced two squares|en passant. capture"),
    ("regras", "O que é afogamento?", r"no legal move and his/her king is not in check"),
    ("regras", "Como funciona a promoção do peão?", r"rank furthest from its starting position"),
    ("regras", "O que é a regra dos 50 lances?", r"last 50 moves"),
    ("fundamentos", "Qual o valor de cada peça?", r"Knight = 3|relative value|worth .{0,20}pawns"),
    ("fundamentos", "O que é um gambito?", r"Gambit\._--|\bgambit\b.{0,60}(pawn|sacrific)"),
    ("fundamentos", "Como o cavalo se move?", r"action of the Knight is peculiar|Knight.{0,40}(leap|jump)"),
    ("fundamentos", "O que é o roque?", r"_Castling\._--|\bcastl.{0,80}(King|Rook)"),
    ("fundamentos", "O que é afogamento?", r"_Stalemate\._--|stalemate"),
    ("fundamentos", "Como funciona a notação?", r"notation may be called|\bnotation\b"),
    ("fundamentos", "Qual a melhor casa para o cavalo na abertura?", r"best place for the King's Knight|Kt\. to .{0,5}B\.? ?3"),
    ("fundamentos", "Devo tirar a dama cedo?", r"not good to play the Queen out|Queen.{0,40}early"),
    # Temas em que o Capablanca é mais forte (aceitam trecho de qualquer livro):
    ("fundamentos", "O que é a oposição entre os reis?", r"opposition"),
    ("fundamentos", "Por que é importante controlar o centro?", r"control of the centre|centre squares|middle of the board"),
    ("fundamentos", "Como dar mate com rei e torre contra o rei sozinho?", r"Rook and King against King|power of the Rook is demonstrated"),
    ("fundamentos", "Quais são os princípios gerais da abertura?", r"develop the pieces quickly|superior officers into action|pieces should be moved in preference"),
    ("estrategia", "O que é um garfo?", r"\bforks?\b"),
    ("estrategia", "O que é uma cravada?", r"\bpin(s|ned)?\b"),
    ("estrategia", "O que é um ataque descoberto?", r"discover|unmask"),
    ("estrategia", "O que é o mate do pastor?", r"Scholar's mate"),
    ("estrategia", "O que é um espeto?", r"skewer"),
]

FORA_DO_TEMA = [
    "receita de bolo de chocolate",
    "Qual é a capital da França?",
    "Como programar em Python?",
    "Quem ganhou a Copa do Mundo de 2022?",
]

# Documentos por índice em cada variante do índice fundamentos.
REGRAS = ["Laws_of_Chess-2023.pdf"]
ESTRATEGIA = ["regis_tactics.pdf"]
CAPABLANCA = "capablanca_chess_fundamentals.txt"
STAUNTON = "staunton_blue_book.txt"
# Cada variante: lista de (arquivo, filtrar listas de lances?).
VARIANTES_FUNDAMENTOS = {
    "Staunton completo": [(STAUNTON, False)],
    "Staunton sem listas": [(STAUNTON, True)],
    "Capablanca completo": [(CAPABLANCA, False)],
    "Capablanca sem listas": [(CAPABLANCA, True)],
    "Capablanca completo + Staunton sem listas": [(CAPABLANCA, False), (STAUNTON, True)],
    "Capablanca + Staunton, ambos sem listas": [(CAPABLANCA, True), (STAUNTON, True)],
}


def carregar_textos(arquivos: list[str] | list[tuple[str, bool]], filtrar_lances: bool = False) -> list[str]:
    """Chunks dos arquivos existentes, com ou sem as listas de lances.

    Aceita nomes de arquivo (todos com o mesmo `filtrar_lances`) ou pares (arquivo, filtrar).
    A ingestão real já filtra os livros de DOCUMENTOS_COM_PARTIDAS; aqui o filtro é desligado
    durante a leitura para que a comparação decida se ele vale a pena.
    """
    import ingest

    pares = [a if isinstance(a, tuple) else (a, filtrar_lances) for a in arquivos]
    original = ingest.DOCUMENTOS_COM_PARTIDAS
    ingest.DOCUMENTOS_COM_PARTIDAS = set()
    try:
        textos = []
        for arquivo, filtrar in pares:
            if (settings.docs_dir / arquivo).exists():
                _, chunks, _ = preparar_chunks(arquivo, "comparacao")
                textos += [c for c in chunks if not (filtrar and eh_lista_de_lances(c))]
        return textos
    finally:
        ingest.DOCUMENTOS_COM_PARTIDAS = original


def codificar(modelo: SentenceTransformer, textos: list[str], prefixo: str) -> np.ndarray:
    return modelo.encode(
        [prefixo + t for t in textos], batch_size=32, normalize_embeddings=True
    )


def avaliar(modelo: Modelo, st: SentenceTransformer, indices: dict[str, list[str]],
            vetores: dict[str, np.ndarray], glossario: bool) -> dict:
    """Roda as perguntas de cada índice e calcula hit@4, MRR e separação de scores."""
    hits, rr, scores_validos, posicoes = 0, [], [], {}
    for indice, pergunta, padrao in PERGUNTAS:
        consulta = expandir_pergunta(pergunta) if glossario else pergunta
        q = codificar(st, [consulta], modelo.prefixo_consulta)[0]
        s = vetores[indice] @ q
        ordem = np.argsort(-s)
        certos = [i for i, t in enumerate(indices[indice])
                  if re.search(padrao, re.sub(r"\s+", " ", t), re.IGNORECASE)]
        pos = min((int(np.where(ordem == i)[0][0]) + 1 for i in certos), default=None)
        posicoes[pergunta] = pos
        hits += bool(pos and pos <= 4)
        rr.append(1 / pos if pos else 0)
        scores_validos.append(float(s[ordem[0]]))
    fora = []
    for pergunta in FORA_DO_TEMA:
        q = codificar(st, [pergunta], modelo.prefixo_consulta)[0]
        fora.append(max(float((vetores[i] @ q).max()) for i in vetores))
    fund = [posicoes[p] for i, p, _ in PERGUNTAS if i == "fundamentos"]
    return {"hit4": hits, "hit4_fund": sum(bool(p and p <= 4) for p in fund), "n_fund_perg": len(fund),
            "mrr": float(np.mean(rr)), "min_valido": min(scores_validos),
            "max_fora": max(fora), "posicoes": posicoes}


def main() -> None:
    # Opcional: `python eval/comparar_embeddings.py e5` roda só os modelos cujo nome contém "e5".
    filtro = sys.argv[1] if len(sys.argv) > 1 else ""
    resultados = []
    for modelo in [m for m in MODELOS if filtro in m.nome]:
        print(f"\nCarregando {modelo.nome} ...")
        st = SentenceTransformer(modelo.nome)
        for variante, arquivos in VARIANTES_FUNDAMENTOS.items():
            indices = {"regras": carregar_textos(REGRAS, False),
                       "fundamentos": carregar_textos(arquivos),
                       "estrategia": carregar_textos(ESTRATEGIA, False)}
            if not indices["fundamentos"]:
                print(f"  (pulando '{variante}': documento ausente)")
                continue
            vetores = {i: codificar(st, t, modelo.prefixo_documento) for i, t in indices.items()}
            for glossario in (True, False):
                r = avaliar(modelo, st, indices, vetores, glossario)
                r.update(modelo=modelo.nome.split("/")[-1], variante=variante,
                         glossario=glossario, n_fund=len(indices["fundamentos"]))
                resultados.append(r)
                print(f"  {variante:<42} glossário={'sim' if glossario else 'não'}: "
                      f"hit@4 {r['hit4']}/{len(PERGUNTAS)} (fundamentos {r['hit4_fund']}/{r['n_fund_perg']})  "
                      f"MRR {r['mrr']:.2f}  "
                      f"min válido {r['min_valido']:.3f}  max fora {r['max_fora']:.3f}")

    print("\n| Modelo | Fundamentos | Glossário | hit@4 | MRR | menor score válido | maior score fora do tema |")
    print("|---|---|---|---|---|---|---|")
    for r in resultados:
        print(f"| {r['modelo']} | {r['variante']} ({r['n_fund']} chunks) | "
              f"{'sim' if r['glossario'] else 'não'} | {r['hit4']}/{len(PERGUNTAS)} | "
              f"{r['mrr']:.2f} | {r['min_valido']:.3f} | {r['max_fora']:.3f} |")

    melhor = max(resultados, key=lambda r: (r["hit4"], r["mrr"]))
    print(f"\nMelhor: {melhor['modelo']} / {melhor['variante']} / glossário={melhor['glossario']}")
    print("Posição do trecho certo por pergunta:")
    for pergunta, pos in melhor["posicoes"].items():
        print(f"  {pos if pos else '-':>4}  {pergunta}")


if __name__ == "__main__":
    main()
