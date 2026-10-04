// Indicador para respostas longas (7–17 s), com o texto da etapa e os segundos.

import { useEffect, useState } from "react";
import { textoDaEtapa, type TipoDeEspera } from "./etapas";

export function Carregando({ tipo }: { tipo: TipoDeEspera }) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const relogio = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(relogio);
  }, []);
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 bg-noite-clara caixa-pixel p-3">
      <span aria-hidden className="grid grid-cols-3 gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="piscando block h-2 w-2 bg-gelo" style={{ animationDelay: `${i * 0.33}s` }} />
        ))}
      </span>
      <span className="text-sm">{textoDaEtapa(tipo, segundos)}</span>
      <span className="ml-auto font-pixel text-[0.6rem] text-slate-600">{segundos}s</span>
    </div>
  );
}
