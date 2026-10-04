// Peças para o react-chessboard: chaves "wK", "bQ"... Sem JSX de propósito: um arquivo .tsx que
// exporta algo que não é componente quebra o Fast Refresh do Vite ("export is incompatible").

import { createElement } from "react";
import type { PieceRenderObject } from "react-chessboard";
import { PecaSprite } from "./PecaSprite";
import type { Lado, Tipo } from "./rotulos";

export { rotuloDaPeca } from "./rotulos";

const LADOS: Lado[] = ["w", "b"];
const TIPOS: Tipo[] = ["k", "q", "r", "b", "n", "p"];

export const PECAS_DO_TABULEIRO: PieceRenderObject = Object.fromEntries(
  LADOS.flatMap((lado) => TIPOS.map((tipo) => [`${lado}${tipo.toUpperCase()}`, () => createElement(PecaSprite, { lado, tipo })])),
);
