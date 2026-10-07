# Retro Chess Club — fundação visual (Prompt 1)

QA em 07/10/2026, Chrome local headless isolado. Navegador integrado indisponível (`iab`).

## Implementação

`src/visual-foundation.css` concentra os tokens e receitas compartilhadas, carregados depois do CSS existente. Os aliases anteriores (`--bg`, `--surface`, `--magnus`, `--ui-radius` etc.) apontam para essa fundação. Estilos locais de tabuleiro e layouts específicos continuam nas folhas atuais.

- Paleta preservada do Login: ink `#12355b`, cream `#f3ecdf`, paper `#fffaf3`, primary `#1565d8`, info `#dcebff`; highlight `#f3d98b`, danger `#b93a32`, success `#237448`.
- Display: Pixelify Sans. UI: Inter 600. Body: Inter 400. Fontes e assets locais preservados.
- Espaçamento: 4, 8, 12, 16, 24, 32 e 48px; gutter 24px / 12px mobile; container máximo 1220px.
- Radius 6 e 8px; sombra suave em superfícies, rígida em seleção especial; foco navy 3px.
- Receitas futuras: `.club-button` com `--primary`, `--secondary`, `--ghost`, `--danger`; `.club-card`, `.club-card--selected`, `.club-surface--info`, `.club-surface--alert`, `.club-empty`.
- Controles atuais herdam as mesmas receitas por seus seletores existentes. Logo, navegação, rating e saúde permanecem no header.

## Verificação visual

| Tela | Tamanhos | Overflow horizontal |
| --- | --- | --- |
| Login | 1440×900, 390×844 | Não |
| Setup autenticado | 1440×900, 1280×900, 768×1024, 390×844 | Não |
| Partida retomada | 1440×900, 1280×900, 768×1024, 390×844 | Não |
| Menu aberto | 390×844 | Não |
| Foco por teclado | Header 1440×900, Login 390×844 | Não |

Capturas PNG e `metrics.json` acompanham este relatório. Capturas completas podem exceder a altura do viewport solicitado, por incluírem toda a página. Diferenças de 15px na largura disponível do desktop correspondem à barra de rolagem vertical.

## Smoke e limites

`check-visual.mjs` usa exclusivamente respostas de API simuladas injetadas no Chrome de QA. Não modifica código de aplicação, backend, conta ou Game real. Credenciais são fictícias (`example.invalid`). Login, mostrar senha, logout, navegação pelas seis seções e retorno à Partida foram exercitados. A instância DOM da Partida foi preservada, com a mesma posição de dois lances; nenhuma requisição POST para `/games` foi disparada. Foco real via Tab foi conferido no header e formulário.

Replay e comentário usam fixtures. Lições não recebem uma lição real; sua navegação foi verificada, sem validar conteúdo remoto. Autenticação e sessão contra backend real ficam pendentes de QA com a conta do usuário. Não houve tentativa de criar partida real nem movimentar peças.

Para repetir, iniciar Vite em `127.0.0.1:5178` e Chrome isolado com CDP em `127.0.0.1:9227`, então executar:

```sh
node frontend/qa-visual/retro-chess-club/check-visual.mjs
```

## Checks

- Suíte completa: 44 arquivos, 365 passed, 0 failed, 0 skipped. Nenhum teste alterado ou removido.
- `VITE_API_URL=/api npm run build`: aprovado.
- `git diff --check`: aprovado.
- Nenhuma alteração em backend, autenticação, navegação, Game, Stockfish, agentes, Tutor ou rating.
- Sem commit, push, tag ou deploy.

## Próxima etapa

Aplicar os tokens às regras locais ainda existentes durante os prompts específicos de cada tela. A revisão humana da fundação vem antes do próximo checkpoint.
