// Fontes de uma resposta como etiquetas clicáveis que expandem o trecho.
// O Stockfish tem visual próprio (motor, não livro).

import { useState } from "react";
import type { Fonte } from "../types";
import { Sprite } from "../pixel/Sprite";
import { ICONE_LIVRO, ICONE_MOTOR } from "../pixel/icones";

function ehMotor(fonte: Fonte): boolean {
  return fonte.documento === "stockfish";
}

export function Fontes({ fontes }: { fontes: Fonte[] }) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (fontes.length === 0) return null;
  return (
    <section aria-label="Fontes" className="answer-sources">
      <p className="support-label">Fontes</p>
      <div className="flex flex-wrap gap-2">
        {fontes.map((fonte, i) => {
          const motor = ehMotor(fonte);
          const icone = motor ? ICONE_MOTOR : ICONE_LIVRO;
          return (
            <button
              key={i}
              type="button"
              aria-expanded={aberta === i}
              data-tipo={motor ? "motor" : "livro"}
              onClick={() => setAberta(aberta === i ? null : i)}
              className={
                "source-button " +
                (motor
                  ? "source-button--engine"
                  : "source-button--book")
              }
            >
              <Sprite grade={icone.grade} paleta={icone.paleta} rotulo={motor ? "motor" : "livro"} tamanho={14} />
              <span>
                {motor ? "Motor: " : ""}
                {fonte.titulo} · {fonte.local}
              </span>
            </button>
          );
        })}
      </div>
      {aberta !== null && (
        <blockquote
          className={
            "source-excerpt " +
            (ehMotor(fontes[aberta])
              ? "source-excerpt--engine"
              : "source-excerpt--book")
          }
        >
          {fontes[aberta].trecho}
        </blockquote>
      )}
    </section>
  );
}
