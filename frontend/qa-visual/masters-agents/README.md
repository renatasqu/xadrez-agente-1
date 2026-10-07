# Masters, agentes e identidade — QA

Chrome headless local, frontend Vite e API do projeto com Stockfish real. O navegador integrado (`iab`) estava indisponível. Foram usados conta fictícia e bancos SQLite temporários. Nenhum banco existente ou de produção foi utilizado; não houve chamada ao LLM.

## Auditoria

O catálogo oficial é `GET /agents`, baseado em `backend/agent_profiles.py`. Os oito perfis têm `profile_version=1`; suas personas também são v1. Categoria é derivada do campo público `inspiration`, sem manter um catálogo paralelo no frontend.

| ID | Nome oficial | Categoria | Dificuldade | Estilo | Persona |
| --- | --- | --- | --- | --- | --- |
| training_beginner | Treino inicial | Treino | beginner | balanced | training · didático |
| balanced | Equilibrado | Treino | intermediate | balanced | training · didático |
| aggressive | Agressivo | Treino | intermediate | aggressive | training · didático |
| positional | Posicional | Treino | advanced | positional | training · didático |
| tactical | Tático | Treino | advanced | tactical | training · didático |
| magnus_inspired | Perfil inspirado em Magnus | Inspirado | advanced | positional | structure · analítico |
| hans_inspired | Perfil inspirado em Hans | Inspirado | advanced | aggressive | initiative · direto |
| judit_inspired | Perfil inspirado em Judit | Inspirado | advanced | tactical | threats · energético |

Nomes, descrições, dificuldade, estilo, versão e metadados de persona vêm do backend. O frontend compartilha somente validação dos metadados e rótulos de apresentação.

Arquitetura confirmada: Game → perfil/versionamento → orçamento da dificuldade → candidatos Stockfish → filtro de qualidade → preferência de estilo → StockfishPolicy → validação do lance legal no servidor → persistência. Personas locais produzem comentários a partir dos fatos do lance já persistido; não decidem lances. Tutor/LLM e frontend não escolhem o lance da IA.

## Fluxo implementado

Masters apresenta os cinco agentes de treino e três perfis inspirados, com dificuldade, estilo e descrição oficial. A explicação visível distingue interpretação educacional de imitação fiel ou endosso, e dificuldade do projeto de Elo/FIDE.

O CTA prepara a seleção no estado existente de `AiGame`, navega para Partida e aguarda escolha do lado e início explícito. Nenhum POST /games ocorre na seleção. Se uma Game estiver aberta, ela tem prioridade: o perfil oficial não é alterado e a interface explica que a partida foi preservada.

A identidade em Game/replay vem de `Game.profile` e do identificador/versionamento oficial. Seleção atual de Masters não substitui dados históricos. Biografias, curiosidades, pixel art e o endpoint/cache FIDE existentes foram mantidos em conteúdo editorial expansível, separado do catálogo.

## Validação visual

30 capturas, sem overflow horizontal. Medições e resultados em [metrics.json](metrics.json).

| Fluxo | Desktop | Mobile |
| --- | --- | --- |
| Masters | [1440×900](masters-1440.png) | [390×844](masters-390.png) |
| FIDE indisponível | [1440×900](fide-unavailable-1440.png) | [390×844](fide-unavailable-390.png) |
| Setup preparado | [1440×900](selected-setup-1440.png) | [390×844](selected-setup-390.png) |
| Game preservada após outra escolha | [1440×900](active-preserved-1440.png) | [390×844](active-preserved-390.png) |
| Histórico | [1440×900](history-1440.png) | [390×844](history-390.png) |
| Replay e identidade | [1440×900](replay-identity-1440.png) | [390×844](replay-identity-390.png) |

Masters, FIDE degradado e setup também foram validados em 1280×900 e 768×1024. Atalhos em Masters ficam no fluxo da página; cards possuem botões reais e indicação textual de seleção.

FIDE indisponível foi simulado na instância temporária de QA; não representa uma avaliação da disponibilidade atual da FIDE. Os testes existentes continuam cobrindo cache, data, ranking ativo e jogador inativo.

## Stockfish real

Quatro Games foram criadas e jogadas com o perfil correto e versão 1:

| Perfil | Humano | Lances oficiais observados |
| --- | --- | --- |
| balanced | Branco | e2e4 e7e5 g1f3 g8f6 |
| balanced | Preto | e2e4 e7e5 g1f3 b8c6 f1b5 |
| magnus_inspired | Branco | e2e4 e7e5 g1f3 b8c6 |
| magnus_inspired | Preto | g1f3 e7e5 f3e5 b8c6 e5c6 |

Em todas: IA automática, dois turnos humanos, Game ativa preservada após tentar escolher outro perfil, retomada após reload pelo Histórico e replay com a identidade original. Snapshot completo da Game e rating permaneceu igual durante navegação/seleção/replay. Tentativas de jogar peças do lado da IA foram bloqueadas, sem POST de lance.

## Qualidade

- Frontend: `npm test -- --maxWorkers=1 --reporter=dot` — 44 arquivos, 364 passed, 0 failed, 0 skipped.
- Backend: `../.venv/bin/python -m pytest -q` em `backend` — 1103 passed, 60 deselected, 0 failed. Política `not llm` mantida.
- Build: `VITE_API_URL=/api npm run build` aprovado.
- `git diff --check` aprovado.
- Backend, StockfishPolicy, difficulty/style, pesos, personas, perfis, ratings e persistência não foram alterados.

Sem commit, push, tag ou deploy.
