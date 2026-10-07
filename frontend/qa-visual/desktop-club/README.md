# Prompt 2 — header, setup e arena desktop

QA em 07/10/2026, Chrome desktop local isolado. Navegador integrado indisponível (`iab`).

## Design implementado

- Fundo creme e header paper de largura total; conteúdo interno compartilha o eixo e máximo de 1220px com setup e arena.
- Header compacto: logo de 160px, seis destinos no centro, rating, servidor/latência e Sair discretos à direita.
- Setup sem o bloco permanente Jogar/Aprender/Praticar no topo. Duas etapas claras, agente selecionado com arte existente, escolha binária e CTA azul.
- Continuação em card horizontal secundário. Links para Lições/Prática preservados como recursos discretos ao final.
- Arena 60%/40% com gap de 24px, barra de jogadores compacta e uma superfície lateral subdividida por separadores.
- Cards usam radius 8px, borda e sombra compartilhados. Nenhuma altura artificial para preencher o painel inicial.
- Inter para navegação, metadados, status e histórico; Pixelify Sans para títulos e nomes.
- Replay altera o heading para Revisão; mantém o mesmo tabuleiro e layout.
- Estilos locais antigos da Game e versões duplicadas de header foram removidos de `index.css` e consolidados em `match-presentation.css`. Fundamentos e Login continuam em `visual-foundation.css`. A regra de Masters que vazava para o guia do setup passou a ser local.

## Capturas verificadas

Cada estado foi capturado em 1440×900 e 1280×900:

1. Login (`login-*`).
2. Setup (`setup-*`).
3. Agente Posicional selecionado (`setup-selected-*`).
4. Game real no início (`game-start-*`).
5. Game após quatro plies (`game-moves-*`).
6. Replay no ply 3 (`replay-*`).

As capturas são da página inteira e podem exceder 900px de altura. `metrics.json` registra dimensões, backgrounds, assets e resultado do smoke. Sem overflow horizontal nos estados capturados. Header e conteúdo compartilham x/largura. Gap board/painel: 24px. Tabuleiro: aproximadamente 718px em 1440 e 716px em 1280; painel com cerca de 403px inicialmente, 559px após lances e 611px em replay.

## Smoke real

Usado o backend do projeto sem alterar seus arquivos, com configuração de execução apontando todos os bancos, Chroma e logs para `/private/tmp/retro-prompt2-runtime`. Conta temporária `desktop-qa@example.invalid`; nenhum banco ou conta real foi usado. Aquecimento, chaves LLM e acesso ao corpus desativados nessa instância. Stockfish local real permaneceu com suas configurações existentes.

Fluxo executado:

- Login pelo formulário e restauração de sessão após reload.
- Continuação pelo card de uma Game temporária criada pela API existente.
- Humano branco contra `balanced`.
- `e2e4` → IA `e7e5`; `g1f3` → IA `g8f6`.
- Navegação Histórico → Partida: mesma instância, game_id, human_color, agent_id e version.
- Replay e retorno à posição atual, sem POST adicional de Game.
- Geometria do tabuleiro idêntica antes/depois do replay (tolerância de 0,5px).
- Exportação PGN pelo botão, texto validado e download no diretório temporário.
- Logout pelo header; `/auth/session` retorna null.

O servidor aparece parcialmente disponível porque a instância de QA não possui chaves LLM nem corpus. Isso é o estado real; os lances de Stockfish e o comentário pedagógico local funcionaram. O envio de perguntas ao LLM não faz parte deste smoke.

## Reprodução

`check-desktop.mjs` espera Vite em `http://127.0.0.1:5180` com `VITE_API_URL=http://127.0.0.1:8898`, backend existente em 8898 com CORS para 5180 e conta temporária configurada, e Chrome com CDP em 9229. O script limpa cookies apenas do Chrome isolado de QA. Não executar apontando para dados reais.

```sh
node frontend/qa-visual/desktop-club/check-desktop.mjs
```

Sem novas dependências, alteração funcional da Game, backend, autenticação, rating, Stockfish ou contratos. Sem commit, push, tag ou deploy.

## Checks finais

- `npm test -- --maxWorkers=1 --reporter=dot`: 44 arquivos, 365 passed, 0 failed, 0 skipped; repetição final em 92,88s. Log em `frontend-tests.log`.
- Houve um timeout intermediário em `ExperienciaPedagogica.test.tsx` ao aguardar a conclusão de um exercício. O arquivo passou isoladamente (9/9) sem edição; a suíte completa seguinte passou. Nenhum teste foi removido ou relaxado.
- Apenas expectativas do heading visual “Histórico e revisão” foram atualizadas para “Partida”, com consultas delimitadas ao Histórico oficial nos testes de integração.
- `VITE_API_URL=/api npm run build`: aprovado.
- `git diff --check`: aprovado.
- Smoke real e preservação da geometria do replay: aprovados.
- Código de estado, criação, retomada e movimento de `AiGame` anterior ao JSX: idêntico ao HEAD.
