# Arena da Game oficial — validação visual

Validado em Chrome headless local, com o frontend Vite real e o backend existente + Stockfish real. O navegador integrado não estava disponível. A instância de QA usou autenticação e bancos temporários fora do projeto; nenhum arquivo de backend ou banco existente foi alterado.

As capturas usam a preferência de movimento reduzido para registrar posições estáveis. São de página inteira; os nomes indicam o viewport usado. A inspeção visual cobriu todos os 20 casos.

| Estado | 1440×900 | 1280×900 | 768×1024 | 390×844 |
| --- | --- | --- | --- | --- |
| Setup | [Imagem](setup-1440x900.png) | [Imagem](setup-1280x900.png) | [Imagem](setup-768x1024.png) | [Imagem](setup-390x844.png) |
| Humano branco | [Imagem](white-1440x900.png) | [Imagem](white-1280x900.png) | [Imagem](white-768x1024.png) | [Imagem](white-390x844.png) |
| Humano preto | [Imagem](black-1440x900.png) | [Imagem](black-1280x900.png) | [Imagem](black-768x1024.png) | [Imagem](black-390x844.png) |
| Terminal | [Imagem](terminal-1440x900.png) | [Imagem](terminal-1280x900.png) | [Imagem](terminal-768x1024.png) | [Imagem](terminal-390x844.png) |
| Replay | [Imagem](replay-1440x900.png) | [Imagem](replay-1280x900.png) | [Imagem](replay-768x1024.png) | [Imagem](replay-390x844.png) |

## Verificações

- Nenhum dos 20 casos apresentou overflow horizontal. As larguras de scroll foram 1425, 1265, 753 e 375 pixels nos respectivos viewports (scrollbar vertical de 15 pixels).
- Tabuleiro com 736 pixels nos desktops, 681 no tablet e 339 no mobile.
- Desktop com painel lateral; tablet/mobile com painel abaixo do tabuleiro.
- Setup desaparece com a Game. Identidade: VOCÊ versus nome oficial do perfil.
- Brancas: e2e4 → e7e5; g1f3 → g8f6, pela interface, sem lance da IA no frontend.
- Pretas: abertura automática e2e4; humano e7e5 → IA g1f3.
- Tentativa de mover pretas pelo humano branco foi ignorada antes de seu primeiro lance.
- Replay mostra posição histórica, navegação e retorno à posição atual.
- Terminal usa uma posição de xeque-mate inicial somente na instância temporária. Resultado, PGN e revisão permanecem na arena. Essa fixture não possui lances nem rating_change; delta e rating novo são cobertos pelos testes com dados oficiais retornados pela API.
- Reconciliação de rating não foi acionada. A revisão automática rejeitou essa ação por conflitar com a instrução de não alterar rating.
- Atalhos flutuantes ficam ocultos durante a Game para não sobrepor o tabuleiro. Tutor contextual permanece no painel; Lições continuam na navegação.

## Verificação funcional

Cobertura mantida para humano branco/preto, human_color, resposta automática, awaiting_agent/retry, terminal, replay e remount/resume. Dois testes adicionais verificam a escolha visual de pretas e o tutor contextual.
