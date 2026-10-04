# Reorganização da arena — 04/10/2026

## Arquivos desta rodada

Implementação:
- `src/App.tsx`: faixas dos agentes e de apoio, grid central, controles e modais.
- `src/index.css`: proporções, header/logo, faixas e responsividade/modal.
- `src/components/BrandLogo.tsx`: branding apenas pela imagem oficial.
- `src/components/ContentModal.tsx`: novo componente para os dois modais, mantendo os filhos montados.

Testes:
- `src/App.modals.test.tsx` (novo).
- `src/components/ContentModal.test.tsx` (novo).
- `src/App.test.tsx`.
- `src/App.exercises.test.tsx`.
- `src/ExperienciaPedagogica.test.tsx`.
- `src/idioma.test.tsx`.
- `src/components/Header.test.tsx`.
- `src/components/Reprodutor.test.tsx`.
- `src/match/MatchArena.test.tsx`.

Assets:
- `public/images/logo-xadrez-multiagente.png`.
- `public/images/logo-xadrez-multiagente-original.jpeg`.

## Componentes preservados

AgentHeaderCard, CurrentTurn, MoveHistory, Board, ExercisePanel, AgentThinking, MatchControls, Chat, Licao, RespostaDoAgente, Reprodutor, HeaderNavigation, StatusSaude e Sobre.
Os componentes do tutor e das lições mantêm as ações reais, fontes, prática e navegação.
As lições mostram também o conteúdo completo no próprio modal; respostas anteriores continuam na conversa do tutor.
Erros da solicitação de lição aparecem no modal e permanecem na conversa.
As ações de prática e demonstração fecham o modal para revelar o tabuleiro.

## Organização e medidas

Desktop: header inline com logo/menu/status, faixa de agentes, faixa turno/histórico/tutor+lições, área central em 78%/22% e controles abaixo.
O grid usa `3.55fr 1fr`, descontado o gap. Medidas em 1024, 1280 e 1440 px confirmaram aproximadamente 78,02% para o tabuleiro.
Não foi criada avaliação geral artificial: a coluna contém somente os dados já existentes dos agentes.
Cards vazios permanecem compactos. Detalhes longos usam expansão e scroll interno.
Sobre mantém documentos e aviso no rodapé compacto.

Tablet: header em duas linhas, análises abaixo do tabuleiro.
Mobile: header → agentes → turno → histórico → acessos tutor/lições → tabuleiro → análises → controles → sobre.

Verificados 320, 390, 820, 1024, 1280 e 1440 px, sem overflow horizontal.
Modais verificados em 320, 390, 820 e 1440 px: abertura, foco dentro da janela, scroll interno, bloqueio do scroll da página e fechamento por Escape.
Saúde e análise foram simuladas apenas no navegador local de QA, sem modificar backend ou contratos.

Apenas a logo estava anexada nesta rodada. A organização segue a arquitetura textual solicitada; não houve comparação com um wireframe ausente.

Veja `LOGO_ASSET.md` para original, transparência, ferramenta e prompt.

## Validação automatizada

- `npm test`: 24 arquivos e 147 testes aprovados.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.
- Os testes de integração E1 e do fluxo partida/demonstração/exercício conservam todas as verificações; seus prazos foram ampliados para 10 segundos para acomodar sequências completas com sprites SVG e modais persistentes.

Não foram adicionadas dependências. Backend, APIs, sprites e hooks de partida/exercícios não foram alterados nesta rodada.

Lição longa simulada: em 1440 px, modal limitado a 852 px com conteúdo interno de 1062 px; em 320 px, modal limitado a 880 px com conteúdo interno de 2791 px. Sem overflow horizontal.
