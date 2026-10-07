// Rodapé "Sobre": documentos usados e aviso de que as respostas são geradas por IA.

import { useState } from "react";

const DOCUMENTOS = [
  ["FIDE Laws of Chess", "FIDE"],
  ["Chess Fundamentals", "J. R. Capablanca"],
  ["The Blue Book of Chess", "H. Staunton"],
  ["Ten Steps to Learn Chess Tactics and Combinations", "D. Regis"],
];

export function Sobre({ onTutor, section, onAnalyses }: { onTutor?: (opener: HTMLElement) => void; section?: "about" | "documentation"; onAnalyses?: () => void } = {}) {
  const [sourcesHovered, setSourcesHovered] = useState(false);
  const [sourcesFocused, setSourcesFocused] = useState(false);
  const sourcesTooltipVisible = sourcesHovered || sourcesFocused;
  return (
    <footer className="game-footer text-xs text-slate-600">
      {section !== "documentation" && <section className="about-project">
      <div className="about-project-intro">
        <p>Xadrez Multiagente é um ambiente educacional para jogar contra agentes, estudar posições e acompanhar sua evolução.</p>
        <h3>JOGAR</h3>
        <p>Em Partida, escolha um agente e seu lado. Você move suas peças; o Stockfish e a política do agente escolhem os lances do adversário. Cada estilo prefere candidatos diferentes entre lances aceitáveis. O servidor guarda e controla a partida oficial; o Histórico permite continuar, rever e exportar em PGN.</p>
        <h3>APRENDER E TREINAR</h3>
        <p>Lições oferece um percurso guiado. Em Prática, explore posições e resolva exercícios sem alterar uma partida oficial ou seu rating.</p>
        <h3>PEDIR AJUDA</h3>
        <p>O Tutor explica o conteúdo e a posição que você está vendo, sem executar lances ou alterar a partida. Masters apresenta os agentes e os estilos de treino.</p>
        <h3>RATING INTERNO E PERFIS</h3>
        <p>A pontuação pertence ao Xadrez Multiagente: não é rating FIDE nem classificação oficial. Os perfis inspirados são interpretações educacionais, sem reprodução fiel, participação ou endosso dos jogadores reais.</p>
        <p>Este projeto nasceu de uma atividade acadêmica sobre inteligência artificial e aprendizagem de xadrez.</p>
        <details><summary>Tecnologias do projeto</summary><p>React · TypeScript · FastAPI · Python · Stockfish · Anthropic · RAG · Embeddings</p></details>
      </div>
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
        análise de posições usa o motor Stockfish. A conta armazena nome e e-mail; progresso, partidas e rating interno
        ficam associados à conta no servidor. Perguntas e trechos podem ser enviados ao provedor de linguagem configurado.
      </p>
      </section>}
      {section !== "about" && <section className="project-documentation" aria-label="Documentação">
        <div className="documentation-block">
          <h3>MOTOR DE ANÁLISE:</h3>
          <p>A análise de posições usa o motor Stockfish.</p>
        </div>
        <div className="documentation-block documentation-references">
          <h3>FONTES E REFERÊNCIAS:</h3>
          <p>As fontes citadas e os trechos dos documentos estão disponíveis no tutor.</p>
        </div>
        <div className="documentation-actions">
          <span className="documentation-action">
            <a href="#/pratica" onClick={onAnalyses} aria-describedby="documentation-analyses-tip">Ver análises dos agentes</a>
            <span id="documentation-analyses-tip" role="tooltip" className="card-action-tooltip documentation-action-tooltip">Consultar análises de posições de treino</span>
          </span>
          {onTutor && <span className="documentation-action">
            <button type="button" onClick={event => onTutor(event.currentTarget)} aria-describedby="documentation-sources-tip"
              onClickCapture={() => { setSourcesHovered(false); setSourcesFocused(false); }}
              onMouseEnter={() => setSourcesHovered(true)}
              onMouseLeave={() => setSourcesHovered(false)}
              onFocus={event => {
                const dialog = event.currentTarget.closest('[role="dialog"]');
                // The modal's initial automatic focus must not open this tooltip.
                const insideDialog = !dialog || (event.relatedTarget instanceof Node && dialog.contains(event.relatedTarget));
                setSourcesFocused(insideDialog && event.currentTarget.matches(":focus-visible"));
              }}
              onBlur={() => setSourcesFocused(false)}
            >Consultar fontes no tutor</button>
            <span id="documentation-sources-tip" role="tooltip" className="card-action-tooltip documentation-action-tooltip"
              style={{ visibility: sourcesTooltipVisible ? "visible" : "hidden", opacity: sourcesTooltipVisible ? 1 : 0, pointerEvents: "none", animation: "none" }}>Abrir fontes e documentos no tutor</span>
          </span>}
        </div>
      </section>}
    </footer>
  );
}
