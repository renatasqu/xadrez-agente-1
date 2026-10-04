/** Ações da partida, separadas para ficarem após a missão e o replay. */
export function BoardControls({ ocupado, podeDesfazer, onAnalisar, onDesfazer, onReiniciar }:
  { ocupado: boolean; podeDesfazer: boolean; onAnalisar: () => void; onDesfazer: () => void; onReiniciar: () => void }) {
  return (
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="botao-pixel bg-gelo text-slate-900" disabled={ocupado} onClick={onAnalisar}>
          Analisar posição
        </button>
        <button type="button" className="botao-pixel bg-slate-200 text-slate-900" disabled={ocupado || !podeDesfazer} onClick={onDesfazer}>
          Desfazer
        </button>
        <button type="button" className="botao-pixel bg-slate-200 text-slate-900" disabled={ocupado} onClick={onReiniciar}>
          Reiniciar
        </button>
      </div>
  );
}
