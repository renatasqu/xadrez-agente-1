// Luz de status a partir de GET /health (verde = ok, amarelo = parcial, vermelho = offline).

import { useEffect, useState } from "react";
import { api } from "../api";
import type { Saude } from "../types";

const INTERVALO_MS = 60_000;

export function StatusSaude() {
  const [saude, setSaude] = useState<Saude | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let ativo = true;
    const verificar = () =>
      api
        .saude()
        .then((s) => ativo && (setSaude(s), setOffline(false)))
        .catch(() => ativo && setOffline(true));
    verificar();
    const relogio = setInterval(verificar, INTERVALO_MS);
    return () => {
      ativo = false;
      clearInterval(relogio);
    };
  }, []);

  const [cor, texto] = offline
    ? ["bg-red-500", "Servidor offline"]
    : !saude
      ? ["bg-slate-400", "Verificando…"]
      : saude.status === "ok"
        ? ["bg-emerald-500", "Servidor ok"]
        : ["bg-yellow-400", "Servidor parcial"];

  return (
    <details className="relative text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-pixel text-[0.55rem]">
        <span aria-hidden className={`block h-3 w-3 border-2 border-slate-900 ${cor}`} />
        {texto}
      </summary>
      {saude && !offline && (
        <ul className="absolute right-0 z-10 mt-2 w-56 space-y-1 bg-slate-100 p-2 text-slate-900 caixa-pixel">
          <li>Stockfish: {saude.stockfish ? "ok" : "ausente"}</li>
          <li>Chave da API: {saude.chave_api ? "ok" : "ausente"}</li>
          {Object.entries(saude.indices).map(([indice, n]) => (
            <li key={indice}>
              Índice {indice}: {n > 0 ? `${n} trechos` : "ausente"}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
