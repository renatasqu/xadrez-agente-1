// Uma peça do tabuleiro: sprite 24×24 desenhado a ~85% da casa, centralizado, com aria-label.
// Este arquivo só exporta componente (o Fast Refresh do Vite exige isso).

import { rotuloDaPeca, type Lado, type Tipo } from "./rotulos";
import { Sprite } from "./Sprite";
import { PALETAS, PECAS } from "./sprites";

const MARGEM_DA_PECA = 2; // 24 / (24 + 2 + 2) ≈ 85% da casa

export function PecaSprite({ lado, tipo }: { lado: Lado; tipo: Tipo }) {
  return <Sprite grade={PECAS[tipo]} paleta={PALETAS[lado]} rotulo={rotuloDaPeca(lado, tipo)} margem={MARGEM_DA_PECA} />;
}
