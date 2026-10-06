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
        <p>Xadrez Multiagente é uma experiência interativa que combina xadrez, agentes de inteligência artificial e aprendizagem.</p>
        <p>Na partida manual, você movimenta os dois lados, apresentados como Magnus e Hans. Em Jogar contra IA, enfrenta um perfil de treino ou um perfil inspirado, com lances calculados pelo Stockfish.</p>
        <p>O projeto também reúne recursos de aprendizagem, como tutor, lições, exercícios, curiosidades e documentos de referência, criando uma experiência que vai além de simplesmente jogar uma partida.</p>
        <p>A análise das posições combina Stockfish, recuperação de informações e modelos de linguagem, com o objetivo de tornar conceitos e decisões do xadrez mais fáceis de explorar e compreender.</p>
        <p>Você pode explorar posições, jogar contra IA e usar a partida como ponto de partida para o aprendizado. Perfis inspirados são interpretações educacionais, sem imitação fiel ou endosso dos jogadores.</p>
        <p>O projeto também surgiu a partir de uma atividade acadêmica relacionada à inteligência artificial e acabou evoluindo para uma experiência mais ampla.</p>
        <h3>OBJETIVO:</h3>
        <p>Transformar uma partida de xadrez em uma experiência visual, interativa e pedagógica, aproximando o usuário dos conceitos do jogo e das análises realizadas pelos agentes.</p>
        <h3>TECNOLOGIAS:</h3>
        <p>React · TypeScript · FastAPI · Python · Stockfish · Anthropic · RAG · Embeddings</p>
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
            <a href="#agentes" onClick={onAnalyses} aria-describedby="documentation-analyses-tip">Ver análises dos agentes</a>
            <span id="documentation-analyses-tip" role="tooltip" className="card-action-tooltip documentation-action-tooltip">Consultar as análises de Magnus e Hans</span>
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
