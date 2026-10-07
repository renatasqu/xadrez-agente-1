# Xadrez Multiagente

## O que é

Um ambiente educacional de xadrez em português para jogar contra agentes, aprender conceitos e estudar posições, com identidade visual pixel art.

## Para quem é

Pessoas que querem aprender e praticar xadrez, com uma conta previamente configurada. O cadastro público está desativado.

## Experiência principal

Após entrar, Partida apresenta três caminhos: jogar contra um agente, aprender nas Lições ou treinar na Prática. O menu leva também ao Histórico, Masters e Sobre.

## Partida

Escolha o agente e brancas ou pretas, depois confirme o início. Você controla somente seu lado; o agente responde automaticamente e faz a abertura quando você escolhe pretas. O servidor persiste a partida oficial. O setup oferece retomada da partida ativa mais recente; outras ficam no Histórico. Ao terminar, há resultado, rating quando disponível, revisão, PGN e nova partida.

## Histórico

Lista suas partidas com adversário, cor, atualização e estado. Permite filtrar, paginar, continuar partidas ativas e rever partidas encerradas. Replay é somente leitura, com análise Stockfish e exportação PGN.

## Masters e agentes

Cinco agentes de treino e três perfis inspirados, com dificuldade, estilo e descrição. Escolher um perfil prepara o setup, sem criar partida. Uma partida já aberta mantém seu adversário. Perfis inspirados são interpretações educacionais, sem imitação fiel, participação ou endosso de jogadores reais. Biografias e dados FIDE dos enxadristas ficam em uma seção editorial separada.

## Lições

Percurso sequencial de 12 lições, das regras aos finais, com objetivo, conteúdo, fontes, prática relacionada e Tutor. O progresso registra lições entregues; conclusões de exercícios são registradas separadamente.

## Prática

Seis exercícios curados, dicas, feedback e exploração de posições movendo ambos os lados. Demonstrações e refutações ajudam a estudar. Nenhuma ação dessa área altera a partida oficial ou o rating.

## Tutor

Explica regras, lições e posições, com fontes quando disponíveis. Recebe o contexto da partida, do lance em replay, do exercício ou da exploração exibida. Conversas anteriores são identificadas quando o contexto muda. Não executa lances nem altera partidas. Cada pergunta é uma chamada independente, sem enviar todo o histórico da conversa ao modelo.

## Rating interno

Pontuação do Xadrez Multiagente, sem equivalência com rating FIDE ou força calibrada dos agentes. Atualizações vêm do fluxo oficial do servidor para partidas elegíveis concluídas. O frontend apenas exibe os valores retornados.

## O que o produto não faz

Não oferece multiplayer, ranking social, plataforma FIDE ou reprodução fiel de enxadristas reais. Comentários e likes da área demonstrativa não têm persistência.

## Arquitetura funcional resumida

O servidor é a autoridade das partidas e do rating. Stockfish e a política determinística do perfil escolhem os lances; dificuldade e estilo orientam essa seleção. A interface apresenta o estado oficial. Tutor, replay e prática permanecem separados da execução de lances oficiais.

## Limitações atuais

Tutor e conteúdo de lições dependem do provedor de linguagem e do acervo configurado; respostas podem conter erros. Dados FIDE dependem de serviço externo e cache. Sem esses serviços, a interface informa a indisponibilidade. Partidas contra IA dependem de Stockfish no servidor. Chat e exploração ficam em memória; partidas oficiais, rating e progresso ficam no servidor. A página legada de curiosidades é provisória e não aparece no menu principal. Implantação e uso público exigem configuração operacional descrita em PRODUCTION.md.
