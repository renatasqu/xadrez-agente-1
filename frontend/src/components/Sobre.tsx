// Rodapé "Sobre": documentos usados e aviso de que as respostas são geradas por IA.

const DOCUMENTOS = [
  ["FIDE Laws of Chess", "FIDE"],
  ["Chess Fundamentals", "J. R. Capablanca"],
  ["The Blue Book of Chess", "H. Staunton"],
  ["Ten Steps to Learn Chess Tactics and Combinations", "D. Regis"],
];

export function Sobre() {
  return (
    <footer className="game-footer text-xs text-slate-600">
      <h2 className="mb-2 font-pixel text-[0.6rem] text-gelo-escuro">SOBRE</h2>
      <details><summary>Documentos da biblioteca</summary><p>As respostas vêm destes documentos:</p>
      <ul className="my-2 list-inside list-disc">
        {DOCUMENTOS.map(([titulo, autor]) => (
          <li key={titulo}>
            <em>{titulo}</em> – {autor}
          </li>
        ))}
      </ul></details>
      <p>
        As respostas são geradas por IA a partir desses documentos e podem conter erros; confira as fontes citadas. A
        análise de posições usa o motor Stockfish. Nenhum dado pessoal é coletado: o progresso das lições usa um id
        anônimo guardado no seu navegador.
      </p>
    </footer>
  );
}
