// Avatares dos dois lados (personagens inventados para este projeto).

import { Sprite } from "../pixel/Sprite";
import { AVATARES } from "../pixel/sprites";

const NOMES = { gelo: "Magnus", fogo: "Hans" } as const;

export function Avatar({ lado }: { lado: "gelo" | "fogo" }) {
  const { grade, paleta } = AVATARES[lado];
  return (
    <span className={"player player--" + lado}>
      <span className={"block h-10 w-10 border-2 border-slate-900 " + (lado === "gelo" ? "bg-sky-100" : "bg-orange-100")}>
        <Sprite grade={grade} paleta={paleta} rotulo={`avatar do ${NOMES[lado]}`} />
      </span>
      <span className={"font-pixel text-[0.55rem] " + (lado === "gelo" ? "text-gelo-escuro" : "text-fogo-escuro")}>{NOMES[lado]}<small className="player-side">{lado === "gelo" ? "Brancas" : "Pretas"}</small></span>
    </span>
  );
}
