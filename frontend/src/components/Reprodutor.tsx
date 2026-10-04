// Controles da demonstração no tabuleiro: anterior, tocar/pausar, próximo e voltar à posição
// da pessoa. O lance atual é anunciado para leitores de tela (aria-live).

import type { PassoDaDemo } from "../demonstracao";
import { sanEmPortugues } from "../demonstracao";

interface Props {
  descricao: string;
  passos: PassoDaDemo[];
  passo: number;
  tocando: boolean;
  onIr: (passo: number) => void;
  onTocar: (tocar: boolean) => void;
  onVoltar: () => void;
}

export function Reprodutor({ descricao, passos, passo, tocando, onIr, onTocar, onVoltar }: Props) {
  const total = passos.length - 1;
  const atual = passos[passo];
  const texto = passo === 0 ? `Posição inicial · ${total} ${total === 1 ? "lance" : "lances"}`
    : `Lance ${passo} de ${total}: ${sanEmPortugues(atual.san ?? "")}`;
  return (
    <section aria-label="Demonstração no tabuleiro" className="replay-panel caixa-pixel p-4">
      <p className="font-pixel text-[0.55rem] text-gelo-escuro">DEMONSTRAÇÃO</p>
      <p className="mt-1 text-sm">{descricao}</p>
      <p className="mt-2 font-pixel text-[0.6rem]" aria-live="polite">
        {texto}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="botao-pixel bg-slate-200 text-slate-900" aria-label="Lance anterior"
          disabled={passo === 0} onClick={() => onIr(passo - 1)}>
          ◀
        </button>
        <button type="button" className="botao-pixel bg-gelo text-slate-900"
          aria-label={tocando ? "Pausar" : passo === total ? "Tocar de novo" : "Tocar"}
          disabled={total === 0} onClick={() => onTocar(!tocando)}>
          {tocando ? "❚❚" : "▶"}
        </button>
        <button type="button" className="botao-pixel bg-slate-200 text-slate-900" aria-label="Próximo lance"
          disabled={passo === total} onClick={() => onIr(passo + 1)}>
          ▶▶
        </button>
        <button type="button" className="botao-pixel bg-fogo text-slate-900" onClick={onVoltar}>
          Voltar à minha posição
        </button>
      </div>
    </section>
  );
}
