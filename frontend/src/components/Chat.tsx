import { tutorContextLabel, type TutorPositionContext } from "../tutorContext";
// Chat: lista de mensagens e campo de pergunta (até 500 caracteres, o limite do backend).

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Demonstracao, Resposta } from "../types";
import { Carregando } from "./Carregando";
import type { TipoDeEspera } from "./etapas";
import { Pergunta, RespostaDoAgente } from "./Mensagem";

const LIMITE_DA_PERGUNTA = 500;

export type ItemDoChat = (
  | { id: number; tipo: "pergunta"; texto: string }
  | { id: number; tipo: "resposta"; resposta: Resposta; erro: boolean; titulo?: string }) & { contextKey?: string; contextLabel?: string };

// "perguntar": resposta de um agente; "recomendar": só os trechos para ler.
export type ModoDoChat = "perguntar" | "recomendar";

interface Props {
  itens: ItemDoChat[];
  allowPosition?: boolean;
  topic?: string | null;
  context?: TutorPositionContext | null;
  contextKey?: string;
  esperando: TipoDeEspera | null;
  onEnviar: (texto: string, anexarPosicao: boolean, modo: ModoDoChat) => void;
  onVerNoTabuleiro?: (demo: Demonstracao) => void;
  onPractice?: (id: string) => void;
}

const MODOS: [ModoDoChat, string][] = [
  ["perguntar", "Perguntar"],
  ["recomendar", "Qual documento me ajuda?"],
];

export function Chat({ itens, esperando, onEnviar, onVerNoTabuleiro, onPractice, context = null, contextKey, topic, allowPosition = true }: Props) {
  const [texto, setTexto] = useState("");
  const [anexar, setAnexar] = useState(false);
  const [modo, setModo] = useState<ModoDoChat>("perguntar");
  const fim = useRef<HTMLDivElement>(null);
  const mensagens = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const painel = mensagens.current;
    if (painel) painel.scrollTo?.({ top: painel.scrollHeight, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [itens.length, esperando]);

  useEffect(() => { setTexto(topic ? `Explique a lição “${topic}”.` : ""); setAnexar(false); }, [contextKey, topic]);

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || esperando) return;
    onEnviar(pergunta, modo === "perguntar" && (Boolean(context) || anexar), modo);
    setTexto("");
  }

  return (
    <section aria-label="Conversa" className="tutor-panel caixa-pixel">
      <header className="tutor-heading"><h2 className="font-pixel">SEU TUTOR</h2><p>Uma pergunta, uma descoberta.</p><p aria-label="Contexto do Tutor">{topic ? `Lição · ${topic}` : tutorContextLabel(context)}</p></header>
      <div ref={mensagens} className="chat-messages flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {itens.length === 0 && (
          <p className="text-sm text-slate-600">
            Pergunte sobre regras, aberturas, táticas ou finais. As respostas vêm só dos livros e citam a fonte.
            Mexa as peças e toque em <strong>Analisar posição</strong> para ouvir o Stockfish e o Estrategista.
          </p>
        )}
        {itens.map((item) => (
          <div key={item.id}>
            {item.contextKey !== undefined && item.contextKey !== contextKey && (
              <p className="mb-1 text-xs font-bold">Conversa anterior · {item.contextLabel ?? "Outra posição"}</p>
            )}
            {item.tipo === "pergunta" ? <Pergunta texto={item.texto} /> : (
              <>
                {item.titulo && <p className="mb-1 font-pixel text-[0.55rem] text-gelo-escuro">{item.titulo}</p>}
                <RespostaDoAgente resposta={item.resposta} erro={item.erro} onVerNoTabuleiro={onVerNoTabuleiro} onPractice={onPractice} />
              </>
            )}
          </div>
        ))}
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
          {modo === "perguntar" && allowPosition && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={Boolean(context) || anexar} disabled={Boolean(context)} onChange={(e) => setAnexar(e.target.checked)} />
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
