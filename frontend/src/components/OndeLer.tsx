// Bloco "Onde ler": os trechos para ler no documento original, na ordem da busca, com a
// frase-chave destacada. PDFs abrem no leitor do navegador na página certa; TXT abre o trecho
// com os parágrafos em volta.

import { useState } from "react";
import { urlDoDocumento } from "../api";
import { Sprite } from "../pixel/Sprite";
import { ICONE_LIVRO } from "../pixel/icones";
import type { TrechoRecomendado } from "../types";
import { ContextoModal } from "./ContextoModal";
import { TextoComDestaque } from "./TextoComDestaque";

export function OndeLer({ itens }: { itens: TrechoRecomendado[] }) {
  const [aberto, setAberto] = useState<TrechoRecomendado | null>(null);
  if (itens.length === 0) return null;
  return (
    <section aria-label="Onde ler" className="recommended-reading">
      <details open className="reading-details"><summary className="support-label">ONDE LER · {itens.length}</summary>
      <ol className="space-y-2">
        {itens.map((item, i) => {
          const pdf = item.documento.toLowerCase().endsWith(".pdf");
          return (
            <li key={item.chunk_id} className="reading-card">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-pixel text-[0.55rem]">{i + 1}.</span>
                <Sprite grade={ICONE_LIVRO.grade} paleta={ICONE_LIVRO.paleta} rotulo="livro" tamanho={14} />
                <strong>{item.titulo}</strong>
                {item.autor && <span>– {item.autor}</span>}
                <span className="opacity-75">· {item.local}</span>
              </div>
              <blockquote className="reading-excerpt">
                <TextoComDestaque texto={item.trecho} destaque={item.frase_destaque} />
              </blockquote>
              {pdf ? (
                <a
                  href={urlDoDocumento(item.documento, item.pagina)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="document-action"
                >
                  Ver no documento (p. {item.pagina})
                </a>
              ) : (
                <button type="button" className="document-action" onClick={() => setAberto(item)}>
                  Ver no documento
                </button>
              )}
            </li>
          );
        })}
      </ol>
      </details>
      {aberto && <ContextoModal item={aberto} onFechar={() => setAberto(null)} />}
    </section>
  );
}
