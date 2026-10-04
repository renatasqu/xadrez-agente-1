# Frontend V1 — experiência pedagógica (etapa 2)

A1/A2/A3/E1 agora são utilizáveis pelo CTA **Praticar este conceito** nas mensagens
(inclusive análise) e no cartão da lição. Múltiplos exercícios relacionados recebem
botões identificados pelo nome, inclusive as três variantes de roque. Respostas
sem associação mantêm o comportamento anterior.

## UI entregue

O layout existente continua com tabuleiro/lição à esquerda e conversa à direita.
Um painel abaixo do tabuleiro mostra exercício, conceito, instrução e feedback curto.
A2 apresenta SIM/NÃO. Quando houver refutação, o painel oferece **Ver sequência de
refutação**, anterior/próximo e **Voltar ao exercício**. O botão de fechar devolve
exatamente a partida anterior. Se houver UUID anônimo e registro retornado pelo
backend, aparecem somente conclusão e número de tentativas.

As bordas internas mantêm os tiles existentes; descrições de origem, destino, casas
atacadas/bloqueadas, atacante, alvos e rei acompanham os destaques em texto abaixo do
Board. Status e feedback usam aria-live. Não houve alteração de sprites, personagens,
backend, bibliotecas, layout geral ou telas de jogo.

## Fluxos

- **A1:** clique/drag envia tentativa mesmo ilegal; incorrect mostra o Fact e conserva
  resulting_fen. O aluno pode tentar novamente; correct mostra conclusão.
- **A2:** AnswerAction booleana, com input de movimento bloqueado. Facts de impedimentos
  continuam visíveis mesmo quando NÃO é a resposta correta.
- **A3:** partial aplica FEN/history canônicos; OpponentReplyFact identifica a resposta
  já aplicada. O aluno continua, enviando o histórico recebido; nenhuma política de
  resposta é executada no cliente.
- **E1:** correct mostra o FEN após o lance; incorrect preserva o FEN autoritativo e
  apresenta material_loss ou allows_mate. A prévia só reproduz a linha UCI recebida e
  verifica sua posição final; linhas inválidas/divergentes não são mostradas.

A prévia de refutação não altera FEN/history do exercício nem histórico da partida;
o movimento fica bloqueado durante a prévia. Abrir prática fecha a demonstração.
Abrir uma demonstração fecha a sessão de prática. Chat e lição não são apagados.

ExercisePanel concentra apresentação e ações. Os sete estados são idle, loading,
active, partial, correct, incorrect e operational_error. O último mostra a mensagem
operacional, sem feedback pedagógico da tentativa anterior, e permite recarregar.
Fechar funciona inclusive durante loading. A proteção de respostas atrasadas permanece
no hook existente. Nenhuma conclusão é criada sem correct.

A consulta de progresso é somente GET, usa o UUID existente e ocorre ao carregar ou
receber novo resultado. Não existe POST extra de progresso ou contador local de
tentativas. Sem UUID, a prática continua sem criar outro identificador. Falha na
consulta de progresso não muda o resultado do exercício.

## Arquivos desta etapa

Criados: `src/components/ExercisePanel.tsx`, `src/components/RelatedPractice.tsx`,
`src/exercises/pedagogia.ts`, `src/exercises/refutacao.ts`,
`src/components/ExercisePanel.test.tsx`, `src/exercises/pedagogia.test.ts`,
`src/ExperienciaPedagogica.test.tsx`, `src/testes/pedagogia.ts`.

Modificados: `src/App.tsx`, `src/components/Board.tsx`, `src/components/Chat.tsx`,
`src/components/Mensagem.tsx`, `src/components/Licao.tsx` e este documento.

## Verificação

`npm test`: **109 testes aprovados**, incluindo todos os anteriores.
`npm run build`: aprovado em TypeScript strict.

Integrações usam o Board real e transporte HTTP simulado com fixtures geradas pelos
validadores reais, sem alterações no backend. Cobrem A1 ilegal/retry/correct, A2 false
com path_occupied, A3 partial/history/correct, E1 seguro/perda/mate, prévia, retorno à
partida já jogada após demonstração, CTA de lição, conversa, progresso e erro operacional.
A fixture de mate é uma posição de teste, não um novo exercício de produção. Não foi
executada uma sessão de browser com servidor real; a descrição acima documenta a UI.

O redesign completo, nova home, configuração/histórico de partidas, telas de vitória,
timer e raciocínio dos agentes continuam adiados. Nenhum desses trabalhos foi iniciado.

---

## Registro da etapa 1

A documentação abaixo descreve a infraestrutura entregue antes da ativação visual.

### Contratos de exercícios (etapa 1)

Esta etapa prepara A1/A2/A3/E1 sem adicionar painel, CTA, dicas, textos pedagógicos ou
animação de resposta adversária. Layout, sprites e backend foram preservados.

## Arquivos

Modificados: `src/types.ts`, `src/api.ts`, `src/components/Board.tsx`, `src/App.tsx`.

Criados: `src/exercises/estado.ts`, `src/exercises/useExercise.ts`,
`src/exercises/visual.ts`, seus testes, `src/exercises/api.test.ts`,
`src/components/Board.test.tsx`, `src/App.exercises.test.tsx`,
`src/testes/exercises.ts` e este documento. Testes antigos permanecem intactos.

## Contratos reais

`types.ts` espelha os quatro objetivos, as ações move/answer, todos os 20 códigos de
facts do backend, dicas discriminadas, ValidationRequest/ValidationResult,
ExerciseError e ExerciseProgress. Resposta e RespostaLicao possuem concept_ids e
related_exercise_ids opcionais para compatibilidade com caches antigos.

O App mantém o envelope completo da lição. Ao enviar conteúdo ao chat, preserva
associações, usa os campos do envelope se faltarem no conteúdo e aplica `[]` como
último default. Nenhum botão de prática foi criado.

| Método | Endpoint | Erro |
| --- | --- | --- |
| api.exercicio(id) | GET /exercises/{id} | ErroDeExercicio |
| api.validarExercicio(id, payload) | POST /exercises/{id}/validate?usuario_id=UUID | ErroDeExercicio |
| api.progressoExercicios(usuarioId) | GET /progresso/exercicios?usuario_id=UUID | ErroDaApi |

A validação lê o UUID existente com lerUsuarioId(), sem criar outro. Sem UUID,
a query é omitida, mantendo a validação stateless do backend. IDs e query são
codificados. O payload tem version, action e history; UUID não vai no corpo.
O progresso é registrado pelo backend durante validate; não existe POST separado
de conclusão. Não há consulta de progresso automática nem conclusão por GET.

ErroDeExercicio preserva code/message e status HTTP, sem fabricar Resposta de
roteador. Rede/timeout/corpo de erro inesperado também ficam como erros operacionais.
Rotas legadas, contexto documental e progresso preservam ErroDaApi.

## Estado e autoridade

useExercise expõe carregar(id), tentar(action) e fechar(), junto de exercise,
loading, validationResult, resulting_fen, history, operationalError, concluido e
visual. O reducer fica separado e puro. A sessão é local ao hook e não altera a
partida do App.

Qualquer resultado correct/incorrect/partial usa resulting_fen e history recebidos,
sem reconstruir o histórico ou mover o adversário. Somente correct estabelece
conclusão. Erro operacional mantém o último resultado e a posição; não cria
incorrect. Requisições duplicadas simultâneas são bloqueadas; respostas atrasadas
após trocar/fechar a sessão são ignoradas.

A2 usa action answer boolean pelo mesmo hook/API. Seu controle SIM/NÃO não foi
implementado; o Board bloqueia MoveAction nesse objetivo.

## Três modos do Board

- normal: chess.js continua filtrando movimento legal e chamando onLance.
- demonstration: FEN de exibição, input bloqueado e destaques existentes.
- exercise: FEN próprio, tentativas enviadas a onTentativa; sem onLance ou controles
  de desfazer/reiniciar/analisar a partida normal.

O formato legado exibicao sem modo ainda funciona. No App, exercício carregado
precede demonstração; depois vem partida normal. A reprodução da demonstração
fica suspensa enquanto houver exercício. O histórico normal permanece separado.

No exercício, clique em peça existente e depois em outra casa gera MoveAction,
mesmo fora dos destinos legais sugeridos. Drag também envia ações ilegais como
b1→b3. Casas inválidas, origem vazia e origem=destino são ignoradas. O drop retorna
false para evitar movimento otimista: somente o novo FEN do servidor atualiza o
Board. Loading e conclusão bloqueiam input.

factsParaVisual concentra a projeção de facts em casas, alvos, linhas UCI e valores
materiais. Linhas e opponent_reply são dados, não ações para reproduzir. Códigos
futuros ou sem representação visual são ignorados com segurança. O Board recebe
a projeção pronta; não distribui switch(fact.code) por componentes.

A sessão está integrada ao App, mas não há controle visual para chamar carregar(id)
nesta etapa. A ativação pelo usuário fica para o ciclo visual solicitado depois.

## Verificação e diferenças encontradas

`npm test`: 93 testes aprovados, incluindo todos os anteriores.
`npm run build`: aprovado com strict/noUnusedLocals/noUnusedParameters.

Os novos testes cobrem API, erros legados/operacionais, UUID, progresso, associações,
autoridade do FEN/history, A2, concorrência/respostas atrasadas, projeção de facts,
clique/drag ilegal e preservação dos modos/partida normal. A fixture partial de A3
foi conferida diretamente no validador real, sem alterar o backend.

Nenhuma incompatibilidade bloqueante. Dois detalhes do backend foram respeitados:
progresso usa erro legado por estar fora de /exercises; usuario_id opcional na
validação é query, não campo de ValidationRequest. Não foram adicionadas bibliotecas.
