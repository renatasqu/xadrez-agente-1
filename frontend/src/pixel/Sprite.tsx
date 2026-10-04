// Desenha uma grade de pixel art como SVG (um <rect> por pixel, sem suavização).

import type { Grade, Paleta } from "./sprites";

interface Props {
  grade: Grade;
  paleta: Paleta;
  rotulo: string; // texto para leitores de tela (aria-label)
  className?: string;
  tamanho?: number | string;
  margem?: number; // pixels vazios em volta da grade (as peças usam 2: 24 de 28 ≈ 85% da casa)
}

export function Sprite({ grade, paleta, rotulo, className, tamanho = "100%", margem = 0 }: Props) {
  const lado = grade.length;
  return (
    <svg
      viewBox={`${-margem} ${-margem} ${lado + 2 * margem} ${lado + 2 * margem}`}
      width={tamanho}
      height={tamanho}
      shapeRendering="crispEdges"
      role="img"
      aria-label={rotulo}
      className={className}
    >
      {grade.flatMap((linha, y) =>
        [...linha].map((c, x) =>
          c !== "." && paleta[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={paleta[c]} /> : null,
        ),
      )}
    </svg>
  );
}
