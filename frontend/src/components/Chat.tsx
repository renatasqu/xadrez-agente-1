// Chat: lista de mensagens e campo de pergunta (até 500 caracteres, o limite do backend).

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Demonstracao, Resposta } from "../types";
import { Carregando } from "./Carregando";
import type { TipoDeEspera } from "./etapas";
import { Pergunta, RespostaDoAgente } from "./Mensagem";

const LIMITE_DA_PERGUNTA = 500;

export type ItemDoChat =
  | { id: number; tipo: "pergunta"; texto: string }
  | { id: number; tipo: "resposta"; resposta: Resposta; erro: boolean; titulo?: string };

// "perguntar": resposta de um agente; "recomendar": só os trechos para ler.
export type ModoDoChat = "perguntar" | "recomendar";

interface Props {
  itens: ItemDoChat[];
  esperando: TipoDeEspera | null;
  onEnviar: (texto: string, anexarPosicao: boolean, modo: ModoDoChat) => void;
  onVerNoTabuleiro?: (demo: Demonstracao) => void;
  onPractice?: (id: string) => void;
}

const MODOS: [ModoDoChat, string][] = [
  ["perguntar", "Perguntar"],
  ["recomendar", "Qual documento me ajuda?"],
];

export function Chat({ itens, esperando, onEnviar, onVerNoTabuleiro, onPractice }: Props) {
  const [texto, setTexto] = useState("");
  const [anexar, setAnexar] = useState(false);
  const [modo, setModo] = useState<ModoDoChat>("perguntar");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end" });
  }, [itens.length, esperando]);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || esperando) return;
    onEnviar(pergunta, modo === "perguntar" && anexar, modo);
    setTexto("");
  }

  return (
    <section aria-label="Conversa" className="tutor-panel caixa-pixel">
      <header className="tutor-heading"><h2 className="font-pixel">SEU TUTOR</h2><p>Uma pergunta, uma descoberta.</p></header>
      <div className="chat-messages flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {itens.length === 0 && (
          <p className="text-sm text-slate-600">
            Pergunte sobre regras, aberturas, táticas ou finais. As respostas vêm só dos livros e citam a fonte.
            Mexa as peças e toque em <strong>Analisar posição</strong> para ouvir o Stockfish e o Estrategista.
          </p>
        )}
        {itens.map((item) =>
          item.tipo === "pergunta" ? (
            <Pergunta key={item.id} texto={item.texto} />
          ) : (
            <div key={item.id}>
              {item.titulo && <p className="mb-1 font-pixel text-[0.55rem] text-gelo-escuro">{item.titulo}</p>}
              <RespostaDoAgente resposta={item.resposta} erro={item.erro} onVerNoTabuleiro={onVerNoTabuleiro} onPractice={onPractice} />
            </div>
          ),
        )}
        {esperando && <Carregando tipo={esperando} />}
        <div ref={fim} />
      </div>
      <form onSubmit={enviar} className="border-t-4 border-[#0e1018] p-3">
        <div role="radiogroup" aria-label="Modo" className="mb-2 flex flex-wrap gap-2">
          {MODOS.map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={modo === valor}
              onClick={() => setModo(valor)}
              className={"botao-pixel " + (modo === valor ? "bg-gelo text-slate-900" : "bg-slate-200 text-slate-900")}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <label htmlFor="pergunta" className="sr-only">Sua pergunta</label>
        <textarea
          id="pergunta"
          value={texto}
          maxLength={LIMITE_DA_PERGUNTA}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) enviar(e);
          }}
          rows={2}
          placeholder={modo === "perguntar" ? "Ex.: Como funciona o roque?" : "Ex.: Onde leio sobre o centro?"}
          className="w-full resize-none border-2 border-slate-900 bg-white p-2 text-sm text-slate-900"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {modo === "perguntar" && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={anexar} onChange={(e) => setAnexar(e.target.checked)} />
              Anexar posição do tabuleiro
            </label>
          )}
          <span className="ml-auto text-xs text-slate-600">
            {texto.length}/{LIMITE_DA_PERGUNTA}
          </span>
          <button type="submit" className="botao-pixel bg-gelo text-slate-900" disabled={!texto.trim() || esperando !== null}>
            {modo === "perguntar" ? "Enviar" : "Recomendar"}
          </button>
        </div>
      </form>
    </section>
  );
}
