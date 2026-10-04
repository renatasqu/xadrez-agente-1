// Texto com uma frase destacada (<mark>). Só texto, nunca HTML.

export function TextoComDestaque({ texto, destaque }: { texto: string; destaque: string }) {
  const inicio = destaque ? texto.indexOf(destaque) : -1;
  if (inicio < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, inicio)}
      <mark className="bg-yellow-300 px-0.5 text-slate-900">{destaque}</mark>
      {texto.slice(inicio + destaque.length)}
    </>
  );
}
