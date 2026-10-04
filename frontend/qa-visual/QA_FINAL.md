# QA visual final do frontend V1

Aplicação real React/Vite aberta no Chrome instalado, com perfil temporário isolado. O navegador integrado estava indisponível. Nenhuma dependência foi adicionada. A tela inicial foi conferida sem backend disponível (status offline); os estados pedagógicos foram exercitados por cliques reais com respostas locais controladas a partir de `src/testes/pedagogia.ts`, geradas anteriormente pelos validadores reais. Este QA não representa uma nova validação da integração com serviços de produção.

## Viewports conferidos

| Viewport | Resultado | Captura |
| --- | --- | --- |
| Desktop 1440 × 1000 | Tabuleiro dominante; header compacto; tutor permanece na lateral ao abrir missão. | [Desktop](desktop-final.png) |
| Laptop 1280 × 800 | Tabuleiro e controles cabem na altura disponível após correção; respostas legíveis. | [Laptop](laptop-final.png) |
| Tablet 768 × 1024 | Tabuleiro primeiro, tutor e lição abaixo; respostas e fontes bem distribuídas. | [Tablet](tablet-final.png), [tutor](tablet-chat-final.png) |
| Mobile estreito 320 × 812 | Header menor; peças visíveis; texto quebra corretamente; ações empilham sem overflow. | [Mobile](mobile-final.png), [tutor](mobile-chat-final.png) |

Não houve elementos ultrapassando horizontalmente o viewport nas medições feitas. O espaço de conteúdo medido desconta a barra vertical de 15 px do Chrome.

## Correções pontuais

Somente `src/index.css` foi alterado na aplicação:

- Limite da largura do tabuleiro pela altura da janela em desktop com até 900 px de altura: evita cortar tabuleiro e controles no laptop.
- Header de mobile reduzido em 20 px por ajuste de espaçamento.
- Removidas bordas/sombras redundantes das respostas; Onde ler mantém apenas borda lateral, reduzindo cards aninhados. Erros continuam com acento próprio.
- Quebra de palavras longas nos painéis de texto para evitar overflow horizontal.

Sem features, novas telas, mudanças de arquitetura, contratos, lógica de exercícios, sprites ou backend.

## Checklist

1. Tabuleiro domina desktop e vem primeiro em tablet/mobile.
2. Magnus/Hans ocupam dois blocos compactos; header mobile passou de aproximadamente 162 para 142 px.
3. Em desktop, abrir ExercisePanel não muda a posição inicial do chat. Empilhamento em tablet/mobile é intencional.
4. Texto das respostas permanece legível nos quatro tamanhos: [desktop](desktop-chat-final.png), [laptop](laptop-chat-final.png), [tablet](tablet-chat-final.png), [mobile](mobile-chat-final.png).
5. Fontes são secundárias; Onde ler tem trecho limitado e pode ser recolhido.
6. CTA de prática aparece após a resposta; cabe em 320 px com quebra de linha.
7. Correct, incorrect e partial distinguem-se por texto e acento: [correct](desktop-correct-final.png), [incorrect](desktop-incorrect-final.png), [partial](mobile-partial-final.png).
8. Highlights usam contornos; sprites permanecem visíveis: [garfo](mobile-fork-highlights-final.png), [refutação](mobile-refutation-board-final.png).
9. A2 SIM/NÃO cabe lado a lado em 320 px: [A2](mobile-a2-final.png).
10. A3 partial diz “Boa. Agora continue.” e “É sua vez de continuar”: [A3](mobile-partial-final.png).
11. Replay tem passo/total, anterior, próximo e retorno; botões empilham no mobile: [refutação](mobile-refutation-final.png), [demonstração](mobile-demo-final.png).
12. Tipografia pixel foi inspecionada nas capturas; texto longo usa fonte de sistema.
13. Sem overflow horizontal nos tamanhos e estados capturados.
14. Tab real do teclado produziu foco de 3 px azul escuro: [foco](laptop-keyboard-focus.png).
15. Movimento reduzido ativado antes de recarregar: media query verdadeira, nenhuma transição nas peças e `animation-name: none` nos três indicadores de espera.
16. Demonstração azul e exercício/ missão creme-dourado são distinguíveis por cor e título.
17. Partida e2→e4 foi preservada ao abrir/fechar exercício: peão branco em e4, e2 vazia e “Vez do Hans (pretas).” restaurados no DOM real.
18. Molduras redundantes de respostas e leituras foram reduzidas.
19. Fundo claro e textos azul profundo mantêm contraste legível nas capturas; foco também visível.
20. Avatares, tiles, tipografia e bordas mantêm linguagem de jogo retrô, sem novos elementos de dashboard.

## Validação

- `npm test`: 114 testes em 19 arquivos, preservando as expectativas existentes.
- `npm run build`: TypeScript e Vite de produção aprovados.

Frontend V1 fechado no escopo solicitado de QA visual e correções pontuais. Capturas correspondem ao frontend real; conteúdo pedagógico/status online dos cenários usam respostas controladas da sessão de QA.
