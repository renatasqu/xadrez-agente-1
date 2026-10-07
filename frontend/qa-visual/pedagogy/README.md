# Lições e Prática — QA pedagógico

Validação no Chrome headless local, com frontend Vite e API do projeto usando Stockfish real. O navegador integrado (`iab`) não estava disponível. A API de QA usou conta fictícia e bancos SQLite temporários; nenhum banco existente ou de produção foi utilizado.

O conteúdo textual das lições foi inserido no cache temporário como fixture de QA, sem chamada paga ao LLM. Catálogo, exercícios, validação determinística, progresso, autenticação, perfis e Game utilizaram as capacidades existentes. As capturas de Tutor verificam interface e contexto visível; não comprovam resposta de um LLM real.

## Arquitetura encontrada

- `#/licoes`: GET `/licao/atual` retoma a última lição entregue; POST `/licao/proxima` entrega a próxima. Não há endpoint para selecionar arbitrariamente uma lição anterior.
- O currículo tem 12 lições existentes (`backend/agents/licoes.py`). O catálogo de apresentação é conferido contra esse arquivo por teste automatizado.
- Progresso das lições significa conteúdo entregue; não mede domínio. Exercícios registram conclusão e tentativas separadamente.
- `#/pratica`, `#explorar` e `#agentes`: histórico local de posições, demonstrações, refutações e exercícios com `useExercise`.
- Game oficial permanece montada em `AiGame` enquanto a navegação altera apenas sua visibilidade.
- Tutor utiliza o contrato estruturado existente: Game/replay por identificadores; exercício/exploração por FEN visível. O contrato não tem metadados de lição: ajuda sobre lição usa pergunta visível/editável e não anexa uma posição oculta.

## Capturas e responsividade

36 capturas, sem overflow horizontal, em 1440×900, 1280×900, 768×1024 e 390×844. Medições em [metrics.json](metrics.json).

| Fluxo | Desktop 1440×900 | Mobile 390×844 |
| --- | --- | --- |
| Lição atual | [Captura](lesson-1440.png) | [Captura](lesson-390.png) |
| Currículo expandido | [Captura](curriculum-1440.png) | [Captura](curriculum-390.png) |
| Tutor da lição | [Captura](lesson-tutor-1440.png) | [Captura](lesson-tutor-390.png) |
| Prática | [Captura](practice-1440.png) | [Captura](practice-390.png) |
| Exercício | [Captura](exercise-1440.png) | [Captura](exercise-390.png) |
| Tutor do exercício | [Captura](exercise-tutor-1440.png) | [Captura](exercise-tutor-390.png) |
| Feedback | [Captura](feedback-1440.png) | [Captura](feedback-390.png) |
| Retorno à Game: brancas | [Captura](white-return-1440.png) | [Captura](white-return-390.png) |
| Retorno à Game: pretas | [Captura](black-return-1440.png) | [Captura](black-return-390.png) |

O tabuleiro de estudo mediu 724, 719, 722 e 351 pixels nos quatro viewports. Tutor abre em modal com scroll interno. Atalhos das áreas pedagógicas ficam no fluxo da página, sem sobrepor tabuleiro ou controles.

## Regressão com Stockfish real

- Humano branco: tentativa de mover peça preta ignorada; e2e4 → e7e5; g1f3 → g8f6.
- Humano preto: abertura automática e2e4; tentativa de mover peça branca ignorada; e7e5 → g1f3; b8c6 → f1b5.
- Em ambos: navegação para Lições, Prática, abertura de exercício e CTA para retornar à Partida, em desktop e mobile. Mesmo `game_id`, cor humana e snapshot completo da API após retorno.
- Snapshots de rating antes/depois foram idênticos. Nenhum exercício criou Game automaticamente.
- IA selecionou seus próprios lances no backend. Tutor nunca submeteu um lance oficial.

## Limites da verificação

Não houve chamada real ao LLM. Retomada arbitrária de lições anteriores continua indisponível no contrato existente; o currículo informa o percurso e o conteúdo atual continua acessível. Nenhum endpoint foi adicionado.

## Qualidade

- Frontend: `npm test -- --maxWorkers=1 --reporter=dot` — 44 arquivos, 362 passed, 0 failed, 0 skipped.
- Backend: `../.venv/bin/python -m pytest -q` em `backend` — 1103 passed, 60 deselected, 0 failed. Política `not llm` mantida.
- Build: `VITE_API_URL=/api npm run build` aprovado.
- `git diff --check` aprovado.
- Nenhum arquivo do backend, Game, agentes ou rating foi alterado. Sem dependências novas.
