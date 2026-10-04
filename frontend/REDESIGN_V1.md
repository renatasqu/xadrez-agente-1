# Redesign visual V1

Interface clara de tutor pixel-art: céu, painéis claros, blocos Magnus/brancas e Hans/pretas, bordas e sombras duras. Sprites, peças e tiles preservados. Sem novas dependências ou alterações no backend e nos contratos.

## Layout e componentes

Desktop a partir de 1024 px: coluna do tabuleiro 1,45 vezes a lateral do tutor. Contexto e turno vêm antes do tabuleiro; missão/replay e controles vêm depois. Lição abaixo do espaço de jogo. Tablet e celular empilham contexto/turno, tabuleiro, missão/replay, controles, tutor com respostas/fontes e lição. Até 480 px, margens e moldura menores; ações mantêm altura mínima de 44 px, SIM/NÃO 58 px.

`BoardControls` foi extraído para posicionar ações após missão/replay sem duplicar sua apresentação. `Board` preserva controles por padrão para seus consumidores. Não foi necessário extrair header/layout em componentes adicionais.

## Exercícios e chat

Missão apresenta título, conceito, objetivo, status textual e feedback. Parcial usa azul/dourado; conclusão verde; tentativa incorreta laranja; falha operacional tem borda tracejada vermelha e mensagem distinta. Refutação usa a mesma aparência do reprodutor de demonstração e mostra passo/total.

O mapper visual conserva seus campos existentes e acrescenta apenas classificação de casas perigosas e bloqueadoras a partir dos facts recebidos. Origem azul, destino amarelo, alvos laranja, atacante com borda mais forte, perigo e rei em mate vermelhos, bloqueio tracejado. Não há cálculos de regra, inferência de resultado, mudanças no FEN ou no fluxo A1/A2/A3/E1.

Tutor lateral: perguntas azul profundo, respostas claras e texto maior que metadados. Fontes secundárias; Onde ler pode ser recolhido por controle nativo, inicialmente aberto para preservar acesso aos trechos. Prática tem destaque azul/dourado. Biblioteca do rodapé recolhível; aviso sobre IA, fontes, Stockfish e id anônimo continua visível.

## Tokens e acessibilidade

Tokens em `src/index.css`: `--azul-magnus`, `--azul-magnus-escuro`, `--ceu`, `--fogo-hans`, `--fogo-hans-escuro`, `--creme`, `--painel`, `--borda`, `--sucesso`, `--perigo` e `--ouro`. Press Start 2P em títulos/ações e fonte do sistema no texto longo.

Rótulos, aria-live, textos equivalentes aos highlights e controles de teclado existentes preservados. Foco visível unificado. Estados continuam anunciados em texto, sem depender apenas de cor. Movimento reduzido também desativa rolagem suave do chat.

## Arquivos

- `src/App.tsx`, `src/index.css`: estrutura e tema.
- `src/components/Avatar.tsx`, `Board.tsx`, `BoardControls.tsx`: rivais, contexto, destaques e ações.
- `src/components/ExercisePanel.tsx`, `Reprodutor.tsx`, `Licao.tsx`: missão, replay e trilha.
- `src/components/Chat.tsx`, `Mensagem.tsx`, `RelatedPractice.tsx`, `Fontes.tsx`, `OndeLer.tsx`, `Carregando.tsx`, `Sobre.tsx`: tutor, leitura e elementos secundários.
- `src/exercises/visual.ts`: classificação exclusivamente visual dos facts.
- `src/components/Board.test.tsx`, `ExercisePanel.test.tsx`, `RelatedPractice.test.tsx`: cinco novos testes de contexto, status anunciado e CTA acessível. Expectativas funcionais existentes mantidas.

## Validação e dívida visual

`npm test`: 114 testes, incluindo os 109 existentes e cinco novos. `npm run build`: TypeScript e produção Vite aprovados. Uma rodada intermediária teve falha intermitente no teste de troca demonstração → exercício (movimento imediatamente após carregamento); o arquivo passou isoladamente, sem mudanças no teste ou na lógica.

Prévia existente gerada com `node scripts/previa.ts 72 /private/tmp/redesign-tabuleiro.png` e inspecionada: sprites/tiles preservados. Essa prévia cobre apenas o tabuleiro. O navegador integrado retornou `Browser is not available: iab`, portanto não foi possível conferir screenshots da página completa. Pendência: inspeção visual real em desktop/mobile, sobretudo alturas do chat, mensagens longas e contraste dos destaques sobre tiles. Breakpoints e estados foram implementados, mas não há alegação de validação visual da página completa.

## QA posterior concluído

A conferência da aplicação real em Chrome, nos quatro viewports e estados pedagógicos, foi concluída na etapa seguinte. Veja `qa-visual/QA_FINAL.md` e as capturas finais. As correções dessa etapa ficaram restritas ao CSS.
