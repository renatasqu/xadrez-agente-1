// Janela com o trecho de um livro em TXT e os parágrafos em volta ("Ver no documento").

import { useEffect, useRef, useState } from "react";
import { ErroDaApi, api } from "../api";
import type { ContextoDoTrecho, TrechoRecomendado } from "../types";
import { TextoComDestaque } from "./TextoComDestaque";

interface Props {
  item: TrechoRecomendado;
  onFechar: () => void;
}

export function ContextoModal({ item, onFechar }: Props) {
  const [contexto, setContexto] = useState<ContextoDoTrecho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fechar.current?.focus();
    const tecla = (evento: KeyboardEvent) => evento.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  useEffect(() => {
    let ativo = true;
    api
      .contexto(item.documento, item.chunk_id)
      .then((dados) => ativo && setContexto(dados))
      .catch((e) => ativo && setErro(e instanceof ErroDaApi ? e.message : "Não consegui abrir o trecho."));
    return () => {
      ativo = false;
    };
  }, [item]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-contexto"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col bg-pergaminho text-amber-950 caixa-pixel"
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="flex items-start gap-2 border-b-4 border-[#0e1018] p-3">
          <h2 id="titulo-contexto" className="flex-1 text-sm">
            <strong>{item.titulo}</strong>
            {item.autor && ` – ${item.autor}`} · {item.local}
          </h2>
          <button ref={fechar} type="button" className="botao-pixel bg-white text-slate-900" onClick={onFechar}>
            Fechar
          </button>
        </header>
        <div className="overflow-y-auto p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {erro && <p role="alert">{erro}</p>}
          {!erro && !contexto && <p role="status">Abrindo o trecho…</p>}
          {contexto && (
            <>
              {contexto.antes.map((p, i) => (
                <p key={`a${i}`} className="mb-3 opacity-70">{p}</p>
              ))}
              <p className="mb-3 border-l-4 border-amber-800 pl-2">
                <TextoComDestaque texto={contexto.trecho} destaque={item.frase_destaque} />
              </p>
              {contexto.depois.map((p, i) => (
                <p key={`d${i}`} className="mb-3 opacity-70">{p}</p>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
