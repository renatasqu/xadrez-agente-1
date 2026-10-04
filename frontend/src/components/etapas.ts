// Textos do indicador de espera (respostas de 7–17 s): mudam conforme o tempo passa, para
// mostrar em que etapa o sistema provavelmente está.

export type TipoDeEspera = "chat" | "analise" | "licao" | "recomendar";

// [a partir de quantos segundos, texto]
const ETAPAS: Record<TipoDeEspera, [number, string][]> = {
  chat: [
    [0, "O Roteador está escolhendo o agente…"],
    [3, "Consultando os livros…"],
    [8, "Conferindo as fontes…"],
    [20, "Quase lá…"],
  ],
  analise: [
    [0, "O Stockfish está calculando…"],
    [3, "O Estrategista está pensando…"],
    [10, "O juiz está conferindo a explicação…"],
    [20, "Quase lá…"],
  ],
  recomendar: [
    [0, "Procurando nos livros…"],
    [3, "Escolhendo os melhores trechos…"],
  ],
  licao: [
    [0, "O Professor está preparando a lição…"],
    [8, "Conferindo as fontes da lição…"],
    [20, "Quase lá…"],
  ],
};

export function textoDaEtapa(tipo: TipoDeEspera, segundos: number): string {
  const etapas = ETAPAS[tipo];
  return [...etapas].reverse().find(([inicio]) => segundos >= inicio)?.[1] ?? etapas[0][1];
}
