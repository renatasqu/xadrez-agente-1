/** Ajustes de apresentação; não modifica contratos nem traduz citações/documentos. */
const FONTES_EM_INGLES = new Set([
  "Laws_of_Chess-2023.pdf", "capablanca_chess_fundamentals.txt", "staunton_blue_book.txt",
  "regis_tactics.pdf", "lasker_manual.pdf",
]);

export function rotuloDoTrecho(documento: string): string {
  return FONTES_EM_INGLES.has(documento)
    ? "Trecho da fonte original (em inglês)" : "Trecho da fonte original";
}

export function idiomaDaFonte(documento: string): "en" | undefined {
  return FONTES_EM_INGLES.has(documento) ? "en" : undefined;
}

export function localDaFonte(local: string): string {
  return local.replace(/\bp\.\s*(?=\d)/g, "Página ").replace(/§\s*/g, "Artigo ");
}

/** Vocabulário do exercício e da dica, já fornecidos em português pelo servidor. */
export function textoPedagogico(texto: string): string {
  return texto.replace(/\bplies\b/g, "jogadas individuais")
    .replace(/\bply\b/g, "jogada individual")
    .replace(/(?<!xeque-)\bmate\b/g, "xeque-mate")
    .replace(/\bperda material\b/g, "perda de material");
}

/** Somente a linha fixa de avaliação do motor; SAN e explicação permanecem intactas. */
export function textoDaAnalise(texto: string): string {
  return texto.split("\n").map((linha) => linha.startsWith("Avaliação: ")
    ? textoPedagogico(linha).replace(/([+-]?\d+)\.(\d+)(?=\s|\)|$)/g, "$1,$2")
    : linha).join("\n");
}
