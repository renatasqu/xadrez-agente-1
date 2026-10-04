// Cartão da lição atual e botão para a próxima.

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
        <h2 className="lesson-heading text-gelo-escuro">LIÇÕES</h2>
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
    </section>
  );
}
