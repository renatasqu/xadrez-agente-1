"""Testa um agente no terminal.

Uso:
    cd backend && source venv/bin/activate
    python testar_agente.py arbitro "Como funciona o roque?"
    python testar_agente.py professor "Qual o valor de cada peça?"
    python testar_agente.py estrategista "O que é um garfo?"
    python testar_agente.py roteador "Como o cavalo se move?"   # sistema completo
    python testar_agente.py roteador "Qual o melhor lance?" --fen "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1"
"""

import argparse

from agents import analista, arbitro, estrategista, professor, router
from llm import LLMNaoConfigurado

# "roteador" passa pelo grafo completo: classifica e escolhe o agente sozinho.
AGENTES = {
    "arbitro": arbitro,
    "professor": professor,
    "estrategista": estrategista,
    "analista": analista,
    "roteador": router,
}
COM_FEN = {"analista", "roteador"}  # aceitam --fen


def main() -> None:
    """Lê o agente e a pergunta da linha de comando e imprime a resposta com as fontes."""
    parser = argparse.ArgumentParser(description="Testa um agente de xadrez no terminal.")
    parser.add_argument("agente", choices=AGENTES)
    parser.add_argument("pergunta")
    parser.add_argument("--fen", help="posição em FEN (analista e roteador)")
    args = parser.parse_args()

    try:
        if args.agente in COM_FEN:
            resposta = AGENTES[args.agente].responder(args.pergunta, fen=args.fen)
        else:
            resposta = AGENTES[args.agente].responder(args.pergunta)
    except LLMNaoConfigurado as erro:
        raise SystemExit(f"LLM não configurado: {erro}")

    print(f"\n[{resposta.agente}] confiança {resposta.confianca:.2f}\n")
    print(resposta.resposta)
    if resposta.fontes:
        print("\nFontes:")
        for fonte in resposta.fontes:
            print(f"  - {fonte.titulo}, {fonte.local}")


if __name__ == "__main__":
    main()
