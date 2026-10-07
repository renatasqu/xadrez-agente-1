// Cartão da lição atual e botão para a próxima.

import { lessonCatalog } from "../lessonCatalog";
import { RelatedPractice } from "./RelatedPractice";
import type { InfoLicao } from "../types";

interface Props {
  licao: InfoLicao | null;
  concluido: boolean;
  ocupado: boolean;
  onProxima: () => void;
  relatedExerciseIds?: string[];
  onPractice?: (id: string) => void;
}

export function Licao({ licao, concluido, ocupado, onProxima, relatedExerciseIds, onPractice }: Props) {
  return (
    <section aria-label="Lições" className="lesson-track flex flex-wrap items-center gap-3 caixa-pixel p-4">
      <div className="flex-1">
        <h2 className="lesson-heading text-gelo-escuro">Seu percurso</h2>
        <p className="mt-2 text-sm">Leia a lição, pratique o conceito e peça ajuda ao Tutor.</p>
        {licao && <><label htmlFor="lesson-progress">Lições entregues: {licao.numero}/{licao.total}</label>
          <progress id="lesson-progress" value={licao.numero} max={licao.total} />
          <p className="text-xs">Este progresso registra lições entregues. Os exercícios registram suas próprias conclusões.</p></>}
        {concluido ? (
          <p className="mt-1 text-sm">Você concluiu todas as lições!</p>
        ) : licao ? (
          <p className="mt-1 text-sm">
            Lição {licao.numero}/{licao.total} · {licao.modulo} · <strong>{licao.titulo}</strong>
          </p>
        ) : (
          <p className="mt-1 text-sm">Regras → notação → aberturas → tática → finais.</p>
        )}
      </div>
      <RelatedPractice ids={relatedExerciseIds} onPractice={onPractice} disabled={ocupado} />
      {!concluido && (
        <button type="button" className="botao-pixel bg-gelo text-slate-900" disabled={ocupado} onClick={onProxima}>
          {licao ? "Próxima lição" : "Começar lições"}
        </button>
      )}
      <details className="lesson-outline" open={licao ? undefined : true}>
        <summary>Ver as {lessonCatalog.length} lições do percurso</summary>
      <ol className="lesson-catalog" aria-label="Lista de lições">
        {lessonCatalog.map((item, index) => <li key={item.titulo} aria-current={licao?.numero === index + 1 ? "step" : undefined}>
          <span className="support-label">{index + 1} · {item.modulo}</span><h3>{item.titulo}</h3>
          <p>{licao?.numero === index + 1 ? "Lição atual · conteúdo abaixo" : concluido || (licao && index + 1 < licao.numero) ? "Já entregue" : "Disponível no percurso sequencial"}</p>
        </li>)}
      </ol>
      </details>
    </section>
  );
}
