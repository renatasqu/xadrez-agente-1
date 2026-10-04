// Uma peça do tabuleiro: sprite 24×24 desenhado a 90% da casa, centralizado, com aria-label.
// Este arquivo só exporta componente (o Fast Refresh do Vite exige isso).

import { rotuloDaPeca, type Lado, type Tipo } from "./rotulos";
import { Sprite } from "./Sprite";
import { PALETAS, PECAS } from "./sprites";

const MARGEM_DA_PECA = 0; // O tamanho de 90% é definido pelo container fluido em CSS.

export function PecaSprite({ lado, tipo }: { lado: Lado; tipo: Tipo }) {
  return <span className="chess-piece"><Sprite grade={PECAS[tipo]} paleta={PALETAS[lado]} rotulo={rotuloDaPeca(lado, tipo)} margem={MARGEM_DA_PECA} /></span>;
}
