// Uma mensagem do chat: pergunta do usuário ou resposta de um agente (nome, confiança,
// texto e fontes).

import type { ReactNode } from "react";
import type { Demonstracao, NomeAgente, Resposta } from "../types";
import { Sprite } from "../pixel/Sprite";
import { ICONES_DOS_AGENTES } from "../pixel/icones";
import { Fontes } from "./Fontes";
import { RelatedPractice } from "./RelatedPractice";
import { OndeLer } from "./OndeLer";

const NOMES_DOS_AGENTES: Record<NomeAgente, string> = {
  arbitro: "Árbitro",
  professor: "Professor",
  estrategista: "Estrategista",
  analista: "Analista",
  roteador: "Roteador",
};

/** Mantém quebras de linha e transforma **negrito** em <strong> (só texto, nunca HTML). */
function formatar(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte,
  );
}

export function Pergunta({ texto }: { texto: string }) {
  return (
    <div className="question-bubble ml-auto max-w-[85%] bg-gelo-escuro caixa-pixel p-3 text-sm whitespace-pre-wrap">{texto}</div>
  );
}

interface PropsDaResposta {
  resposta: Resposta;
  erro?: boolean;
  onVerNoTabuleiro?: (demo: Demonstracao) => void;
  onPractice?: (id: string) => void;
}

export function RespostaDoAgente({ resposta, erro = false, onVerNoTabuleiro, onPractice }: PropsDaResposta) {
  const icone = ICONES_DOS_AGENTES[resposta.agente];
  const temFonte = resposta.fontes.length > 0;
  const porcentagem = Math.round(resposta.confianca * 100);
  const ondeLer = resposta.onde_ler ?? [];
  const recomendacao = !temFonte && ondeLer.length > 0; // modo "Qual documento me ajuda?"
  return (
    <article
      className={"tutor-answer caixa-pixel p-4 " + (erro ? "tutor-answer--error bg-orange-50 text-red-900" : "bg-slate-100 text-slate-900")}
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 bg-white px-1.5 py-1 font-pixel text-[0.6rem] text-slate-900 border-2 border-slate-900">
          <Sprite grade={icone.grade} paleta={icone.paleta} rotulo="" tamanho={14} />
          {NOMES_DOS_AGENTES[resposta.agente]}
        </span>
        {temFonte ? (
          <span className="flex items-center gap-1.5 text-xs" aria-label={`confiança ${porcentagem}%`}>
            <span aria-hidden className="flex gap-px">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={"block h-3 w-1.5 " + (i < Math.round(porcentagem / 10) ? "bg-emerald-600" : "bg-slate-300")} />
              ))}
            </span>
            confiança {porcentagem}%
          </span>
        ) : (
          <span className="text-xs opacity-70">{erro ? "erro" : recomendacao ? "recomendação de leitura" : "sem fonte"}</span>
        )}
      </header>
      <div className="answer-explanation text-sm leading-relaxed whitespace-pre-wrap">{formatar(resposta.resposta)}</div>
      {resposta.demonstracao && onVerNoTabuleiro && (
        <button type="button" className="botao-pixel mt-3 bg-gelo text-slate-900"
          onClick={() => onVerNoTabuleiro(resposta.demonstracao!)}>
          Ver no tabuleiro
        </button>
      )}
      {!erro && <RelatedPractice ids={resposta.related_exercise_ids} onPractice={onPractice} />}
      <Fontes fontes={resposta.fontes} />
      <OndeLer itens={ondeLer} />
    </article>
  );
}
