# Xadrez Agente — Professor de xadrez multiagente com RAG

## Backend V1 fechado

A especificação vigente da integração está em [BACKEND_V1.md](BACKEND_V1.md). As seções
por fase abaixo também registram decisões históricas do RAG. Não gerar exercícios via LLM,
não acoplar banco aos validadores e não transformar fontes legadas em dependências obrigatórias.

## Objetivo
Aplicação web que ensina xadrez a iniciantes. Um sistema multiagente responde perguntas
**com fontes curadas ou documentos recuperados**, cita as fontes, analisa posições com
Stockfish e oferece lições, exercícios curados e progresso. Projeto acadêmico: priorizar código simples, legível
e bem comentado em vez de abstrações complexas.

## Documentos (backend/docs/)
- `Laws_of_Chess-2023.pdf` — FIDE Laws of Chess (FIDE, em vigor desde 1/1/2023) → índice `regras`.
  É a impressão da página web do FIDE Handbook: só 3 páginas longas, com títulos repetidos e o menu
  do site no meio (a ingestão limpa isso). As citações usam o número do artigo: "p. 1, § 3.8.2".
- `capablanca_chess_fundamentals.txt` — Chess Fundamentals (J. R. Capablanca, 1921/1934, Project
  Gutenberg) → índice `fundamentos`, fonte principal para princípios (centro, desenvolvimento,
  oposição, finais). Não explica o movimento das peças nem a notação. A ingestão remove
  "[Illustration]" e os números de página "{24}". Fica completo (361 chunks), sem filtro de lances.
- `staunton_blue_book.txt` — The Blue Book of Chess (H. Staunton, ed. revisada 1910, Project Gutenberg)
  → índice `fundamentos`, complementar: peças, termos (gambito, afogamento), notação descritiva.
  A ingestão descarta o cabeçalho/licença do Gutenberg (mantém só o que está entre
  "*** START OF" e "THE END."), os tabuleiros ASCII e seus rótulos.
- Livros com partidas transcritas (`DOCUMENTOS_COM_PARTIDAS` no config.py, hoje só o Staunton):
  chunks que são quase só listas de lances ou notas de partidas são descartados (630 → 188).
- `regis_tactics.pdf` — Ten Steps to Learn Chess Tactics and Combinations (Dr Dave Regis,
  Exeter Chess Club) → índice `estrategia` (tática e combinações; base das explicações do
  Estrategista/Analista). Os diagramas viram texto-lixo na extração ("cuuuuuuuuC", "(rhb1kgn4}"):
  a ingestão deve descartar essas linhas.
- `lasker_manual.pdf` — Lasker's Manual of Chess (E. Lasker) → índice `estrategia` (opcional,
  ainda não adicionado)
O mapeamento arquivo → índice fica em `backend/config.py`.

## Stack
- **Backend:** Python 3.11, FastAPI, Pydantic v2, LangGraph + LangChain, ChromaDB (persistente
  em `backend/chroma/`), sentence-transformers (`intfloat/multilingual-e5-base`, com os prefixos
  "query: " nas perguntas e "passage: " nos chunks), pypdf, python-chess, Stockfish, slowapi.
- **LLM:** configurável por `LLM_PROVIDER` = `anthropic` (padrão) | `openai` (gpt-4o-mini) |
  `ollama`. Com Claude, um modelo por papel no `.env`: `CLASSIFIER_MODEL`
  (`claude-haiku-4-5-20251001`, classificador do roteador, `temperature=0`) e `AGENT_MODEL`
  (`claude-sonnet-5-5`, agentes). Sonnet/Opus 5.5 não aceitam `temperature` e sempre raciocinam
  (controle por `effort`); o Haiku 4.5 recusa `effort`. `llm.criar_llm(papel=...)` trata isso.
  A saída estruturada usa `method="json_schema"`.
- **Frontend:** React + Vite + TypeScript, Tailwind CSS, react-chessboard, chess.js.
- **Eval:** pytest, RAGAS.

## Estrutura
```
backend/
  main.py            # FastAPI: rotas, CORS, rate limit
  config.py          # settings (pydantic-settings, lê .env)
  ingest.py          # PDFs → chunks → embeddings → ChromaDB (uma coleção por índice)
  retrieval.py       # busca com limiar de similaridade
  llm.py             # fábrica do LLM conforme LLM_PROVIDER
  guardrails.py      # escopo, injeção, validação de FEN/lances, checagem de saída
  schemas.py         # modelos Pydantic de entrada/saída
  progresso.py       # progresso das lições e cache do conteúdo (SQLite, id anônimo)
  onde_ler.py        # bloco "Onde ler": trechos pela ordem da busca e frase-chave (sem LLM)
  documentos.py      # acesso seguro a backend/docs (allowlist) para "Ver no documento"
  agents/
    router.py        # grafo LangGraph: classifica e encaminha
    arbitro.py       # índice regras
    professor.py     # índice fundamentos
    licoes.py        # currículo: regras → notação → aberturas → tática → finais
    demonstracoes.py # demonstrações curadas no tabuleiro (roque, en passant, peças, mate...)
    estrategista.py  # índice estrategia
    analista.py      # Stockfish via python-chess
  docs/              # PDFs
  eval/
    eval.jsonl       # golden set
    test_*.py        # testes determinísticos e RAGAS
    comparar_embeddings.py  # compara modelos/configurações de busca (hit@4, MRR, limiar)
    avaliar_roteamento.py   # acurácia do roteador por modelo (casos rotulados, chama o LLM)
    avaliar_guardrails.py   # injeção (padrões x classificador) e acurácia do juiz (chama o LLM)
frontend/
  src/App.tsx          # layout: tabuleiro + lição | chat (uma coluna no celular), rodapé Sobre
  src/api.ts           # todas as chamadas; URL em VITE_API_URL; erro sempre mostra .resposta
  src/armazenamento.ts # usuario_id no localStorage (try/catch, cai para memória)
  src/lances.ts        # regras do tabuleiro com chess.js (lance legal, destinos, situação)
  src/components/      # Board, Chat, Mensagem, Fontes, Carregando, Licao, StatusSaude, Sobre, Avatar
  src/pixel/           # sprites 16×16 das peças e avatares, ladrilhos, ícones (tudo original)
  scripts/previa.ts    # gera um PNG do tabuleiro para conferir os sprites (npm run previa)
  previa/              # PNGs do tabuleiro com casas de 40 px e 32 px
```

## Agentes
- **Roteador:** classifica a pergunta em `regras | fundamentos | estrategia | analise | fora_do_tema`.
  Regras (Fase 3):
  - A checagem de tema vem primeiro: `fora_do_tema` é recusado sem busca nem agente (dois casos,
    "receita de bolo de chocolate" e "Como programar em Python?", passavam do `MIN_SCORE`).
  - FEN escrito na pergunta → categoria `analise`; o classificador ainda recebe o texto (com o
    FEN trocado por "[posição]") para checar injeção. FEN inválido é avisado.
  - FEN só no campo `fen` (tabuleiro anexado no frontend) → quem decide é o classificador: vira
    `analise` só se ele disser `analise` ou se a pergunta falar da posição/melhor lance
    (`pede_analise`). "Como funciona o cavalo?" com o tabuleiro anexado vai para o Árbitro.
  - Regra fixa: *como* as peças se movem e notação → `regras` (FIDE art. 3 e Apêndice C), mesmo
    que o LLM escolha fundamentos/estrategia; nunca tira uma pergunta de `fora_do_tema`. Vale
    também para "como funciona/joga o [peça]" e "o que o [peça] faz" (rei, dama/rainha, torre,
    bispo, cavalo, peão). "Qual a melhor casa para o cavalo na abertura?" continua com o Professor.
    O glossário expande "como funciona/joga" para os termos de movimento ("move moves may move
    to"): sem isso, "Como funciona o cavalo?" não achava nada acima do limiar em `regras`.
  - Fallback: sem trecho acima do limiar no índice escolhido, ou se o agente recebe trechos mas
    responde "Não encontrei", tenta os outros índices (registrado como `roteador/fallback`);
    responde o agente dono do índice onde achou. Erro de formato do LLM não dispara o fallback.
    Pior caso: 3 chamadas ao agente, perto do timeout de 30 s.
- **Árbitro:** regras oficiais; consulta só o índice `regras`.
- **Professor:** fundamentos e lições progressivas (regras → notação → aberturas → tática →
  finais). As 12 lições (`agents/licoes.py`) são perguntas nossas respondidas pelo agente do
  índice de cada uma, com fontes, juiz e checagem de saída. O catálogo de conceitos associa
  exercícios existentes às lições; a correção é exclusiva dos validadores determinísticos.
- **Estrategista:** planos e avaliação de posição; índice `estrategia`.
- **Analista** (`agents/analista.py`, Fase 5): recebe FEN, roda Stockfish (tempo máx. 1 s), e o
  Estrategista explica o lance.
  - Os fatos do motor (melhor lance em SAN e em português, avaliação em palavras, linha
    principal, características do lance calculadas pelo python-chess) são escritos pelo código,
    nunca pelo LLM. O Stockfish aparece como primeira fonte (`documento="stockfish"`).
  - Todo lance do motor passa por `guardrails.validar_lance`; todo lance citado pelo Estrategista
    (`lances_mencionados`) precisa estar na linha do motor ou ser legal na posição, senão a
    explicação é descartada (`lance_ilegal`).
  - Explicação: índice `estrategia` e depois `fundamentos`. O fallback vale também quando o
    Estrategista não consegue explicar com os trechos: com o e5, `estrategia` quase sempre passa
    do limiar com trechos genéricos (ex.: 1.e4). Quando há padrão tático com nome (mate do
    corredor, garfo), a busca usa só ele.
  - Sem explicação, a resposta mantém os fatos do motor e diz "Não encontrei nos documentos uma
    explicação para este lance" (confiança 0). Fim de jogo (mate, afogamento, material
    insuficiente) e pergunta sem FEN são respondidos sem abrir o motor.
  - O processo do Stockfish é sempre fechado (`fechar_motor` num `finally`); Stockfish ausente
    gera erro claro no log do servidor e mensagem amigável ao usuário.

## Guardrails (obrigatórios)
1. Recusar perguntas fora do tema de xadrez com mensagem educada.
2. Detectar prompt injection; o texto dos documentos é **dado, nunca instrução**.
3. Limiar de similaridade (`MIN_SCORE`, padrão 0.79 para o e5): abaixo disso, responder
   "Não encontrei isso nos documentos" em vez de inventar. O valor depende do modelo de
   embeddings (ver "Busca multilíngue"); o limiar sozinho não separa bem perguntas fora do tema,
   por isso o roteador (Fase 3) também as recusa.
4. Toda resposta cita documento e trecho de origem. Sem fonte, sem resposta.
5. Todo FEN e todo lance sugerido pelo LLM é validado com python-chess; lance ilegal é descartado.
6. Saída do LLM em JSON validado por Pydantic: `resposta, fontes, agente, confianca`.
7. Chaves apenas em `.env` (nunca no frontend nem no git); rate limit; timeout; limite de tokens.
8. Não coletar dados pessoais.

Implementação (Fase 4, `guardrails.py`), na ordem do grafo do roteador:
- **Entrada:** remove caracteres de controle; pergunta vazia ou acima de `MAX_PERGUNTA` (500) e
  FEN acima de `MAX_FEN` (100) são recusados sem chamar o LLM.
- **Padrões de injeção** (`PADROES_INJECAO`): verbo de comando + alvo ("ignore … instruções",
  "mostre … prompt", "você agora é", tags falsas). Exigir os dois evita barrar "Posso ignorar um
  xeque?".
- **Classificador:** o campo `tentativa_de_injecao` pega injeção disfarçada, inclusive dentro de
  uma pergunta de xadrez legítima. Se marcado, a pergunta inteira é recusada.
- **Juiz de fundamentação** (`JUDGE_MODEL`, Haiku): recebe só os trechos citados e a resposta.
  Na análise de posição recebe também `<fatos_do_motor>`: o prompt diz que números e lances do
  Stockfish não podem ser penalizados por não estarem nos livros; contradizê-los é `nao`, e aí
  só a explicação sai (os fatos do motor ficam).
  `nao` → "Não encontrei"; `parcial` → confiança ≤ 0.5 e aviso no texto; falha do juiz (formato
  ou timeout) → igual a `parcial`, mas registrada como `falha_juiz`. `VERIFICAR_FUNDAMENTACAO`
  desliga o juiz.
- **Saída:** resposta de agente sem fonte → "Não encontrei"; frases dos nossos prompts na
  resposta → bloqueada; acima de `MAX_RESPOSTA` (3000) → cortada no fim de uma frase.
  `Resposta` recusa confiança > 0 sem fonte.
- **Timeouts:** 60 s para agentes, 15 s para classificador e juiz (`LLM_TIMEOUT_RAPIDO`);
  erros de API/timeout viram uma mensagem amigável. Timeout total por requisição e rate limit:
  Fase 7 (FastAPI + slowapi).
- **Lances:** `validar_lance(fen, lance)` aceita SAN ou UCI e devolve SAN ou None (usado pelo
  Analista).
- **Registro:** cada ação vai para `backend/logs/guardrails.jsonl` (fora do git) com `camada`
  (entrada, padroes, classificador, juiz, saida, llm, analista, roteador), `acao` e `motivo`, sem o texto da
  pergunta. `guardrails.resumo_do_log()` conta por camada/ação para a Fase 8. Os testes gravam
  numa pasta temporária (`conftest.py`), e os testes offline desligam o juiz e a chave da API.

## API (Fase 6, `main.py`)
- Rotas:
  - `GET /health`: Stockfish, nº de chunks por índice e se a chave da API existe (nunca o valor).
    Sem rate limit.
  - `POST /chat {mensagem, fen?}`: roteador completo.
  - `POST /analisar {fen}`: Analista direto, sem classificador (só FEN validado, sem texto livre).
  - `POST /licao/proxima {usuario_id?}`: entrega a próxima lição e avança o progresso, só se a
    lição veio com fontes. Sem id, o servidor cria um UUID.
  - `GET /licao/atual?usuario_id=`: só lê a última lição entregue (404 se não começou).
  - `POST /ingest`: desativado sem `ADMIN_TOKEN`; exige o header `X-Admin-Token`, 1 req/min.
    Durante a ingestão as outras rotas respondem 503. Limpa o cache das lições.
- Todo corpo de resposta, inclusive de erro (422, 429, 503, 504, 500), tem o formato de
  `Resposta`: o frontend sempre pode mostrar `.resposta`. Tracebacks ficam só no log do servidor.
- `usuario_id` só aceita UUID (nada de e-mail ou nome: guardrail 8). Progresso e cache do
  conteúdo das lições em `backend/progresso.sqlite` (fora do git); cada lição é gerada pelo LLM
  uma vez e servida do cache para todos.
- Na subida (lifespan): tabelas do SQLite, modelo de embeddings e cliente do ChromaDB carregados
  uma vez (`AQUECER_NA_INICIALIZACAO`; os testes desligam). O cliente do ChromaDB é reaproveitado
  (`lru_cache`), antes era criado a cada busca.
- Pipeline bloqueante numa thread (`run_in_threadpool`) com `TIMEOUT_REQUISICAO` (30 s; análise
  completa leva ~12–17 s) → 504 com mensagem amigável. Rate limit `RATE_LIMIT` (20/min por IP,
  slowapi). CORS só para `CORS_ORIGENS` (`http://localhost:5173`).
- Testes (`tests/test_api.py`): TestClient com LLMs falsos via `app.dependency_overrides[obter_llms]`.
- **Limitações conhecidas:**
  - Timeout por thread: o Python não interrompe uma thread. Depois dos 30 s o usuário recebe o
    504, mas a thread segue até os timeouts do próprio LLM (60 s agentes, 15 s classificador e
    juiz, com 1 nova tentativa); o Stockfish é fechado no `finally` do Analista. Sob carga, várias
    threads "órfãs" podem ocupar o threadpool.
  - Embeddings são gerados um de cada vez (`_trava_do_modelo` em `ingest.py`): carregar o modelo
    numa thread e gerar embeddings em duas threads ao mesmo tempo derrubava o processo (segfault
    no PyTorch, reproduzido na Fase 6; regressão em `tests/test_concorrencia.py`). Uma pergunta
    leva ~20 ms, então a fila não pesa.
  - O rate limit é por IP e em memória (reinicia com o servidor; atrás de um proxy todos teriam o
    mesmo IP).

## Onde ler, documentos e demonstrações (sem chamadas novas ao LLM)
- **Onde ler** (`onde_ler.py`): toda resposta de agente (e a explicação do Analista) traz
  `onde_ler`: até 3 trechos na ordem do score da busca (o melhor e os que ficam a no máximo 0.03
  dele), com título, autor (`AUTORES` no config), local e a **frase-chave** escolhida pelo código
  (frase do trecho com maior similaridade com a pergunta, pelo mesmo modelo e5). Frases que são
  listas de lances, cabeçalhos de partida, páginas de rosto ou créditos do Gutenberg não viram
  destaque; trecho sem frase legível não é recomendado. Nos testes offline a frase-chave usa
  palavras em comum (`tests/conftest.py`); o marcador `modelo_real` usa o modelo (offline).
- **Ver no documento:** `GET /documentos/{nome}` serve só arquivos da allowlist (`DOCUMENTOS`),
  com nome simples, sem link simbólico, resolvido dentro de `backend/docs`, só `.pdf`/`.txt`;
  qualquer falha é 404 no formato de `Resposta`. PDFs abrem no navegador em `#page=N`.
  `GET /documentos/{nome}/contexto?chunk_id=` devolve o trecho com 2 parágrafos antes e depois
  (o chunk precisa existir e ser do mesmo documento). 404/405 do roteador também vêm como `Resposta`.
- **Qual documento me ajuda?** `POST /recomendar {mensagem}`: checagens de entrada e classificador
  (tema e injeção), busca nos três índices, devolve só `onde_ler`. Nenhum agente nem juiz.
- **Demonstrações** (`agents/demonstracoes.py`): `Resposta.demonstracao = {fen_inicial, lances
  (SAN), descricao}`. Regras: posições curadas no código, escolhidas pelo tema da pergunta
  (palavras-chave), só em respostas com fonte do Árbitro (e notação do Professor); nunca do LLM.
  Análises: a linha principal do Stockfish. `guardrails.validar_demonstracao` confere FEN e cada
  lance em ordem; inválida é descartada (`saida/demonstracao_invalida`). Nas demonstrações de uma
  peça, o rei preto faz os lances do meio (os lances precisam alternar os lados).
- **Frontend:** bloco "Onde ler" com a frase destacada; "Ver no documento" (PDF em outra aba na
  página; TXT numa janela com o contexto); modo "Perguntar / Qual documento me ajuda?"; botão
  "Ver no tabuleiro" com tocar/pausar/anterior/próximo, casas destacadas, lance anunciado
  (aria-live) e "Voltar à minha posição" (a partida da pessoa fica guardada). Sem animação com
  `prefers-reduced-motion` (os testes rodam assim: o jsdom não tem layout).
- **Ficou de fora (de propósito):** BM25, reranker e pergunta em inglês (step 1), o "por que este
  trecho" escrito pelo LLM e o "Explicar com base nisso". Conhecido: a página de rosto do
  Capablanca (linhas 1-80) está no índice e às vezes aparece na busca; corrigir na ingestão.

## Frontend (Fase 7)
- Vite + React 19 + TypeScript + Tailwind 4 (`@tailwindcss/vite`), react-chessboard 5 (props em
  `options`) e chess.js. Fonte dos títulos: Press Start 2P (`@fontsource`, licença OFL, empacotada;
  o texto das respostas usa a fonte do sistema). Testes: Vitest + Testing Library + jsdom.
- Tema original em pixel art: casas de grama (claras) e pedra (escuras). As peças (24×24,
  desenhadas a ~85% da casa, centralizadas) são bonequinhos chibi de coleção: cabeça redonda com
  ~45% da altura, olhos com 1 pixel de brilho, bochechas rosadas, pedestal arredondado e sombra
  semitransparente. A silhueta clássica fica no que usam na cabeça: coroa com cruz (rei, a única
  peça com cruz), coroa de pontas (dama), elmo com ameias (torre), mitra com fenda diagonal
  (bispo), capacete redondo de soldado (peão); o cavalo é uma cabeça de cavalo no mesmo pedestal.
  Contorno no tom escuro de cada paleta (não preto). Arquivos `.tsx` só exportam componentes
  (Fast Refresh do Vite); dados e funções ficam em `.ts` (`pecas.ts`, `rotulos.ts`, `etapas.ts`). Lados: "Magnus" (brancas, lado
  do gelo: roupa e base claras, contorno azul-marinho, cabelo de geada) e "Hans" (pretas, lado do
  fogo: roupa, base e contorno escuros; o fogo fica nos detalhes: cabelo e barba em chamas, joias
  douradas); a diferença não depende só da cor. Toda peça tem aria-label ("torre branca").
  Os nomes dos lados (só o primeiro nome, sem sobrenome) foram escolha da autora; sprites e
  avatares continuam sendo desenhos originais, sem retratar ninguém (nada de penteados ou
  feições de pessoas reais). **Não usar assets, texturas, fontes, logos ou personagens de
  Minecraft.**
- Legibilidade conferida em PNG com casas de 40 px e 32 px (`frontend/previa/`, gerado por
  `npm run previa`; o script monta o PNG com o zlib do Node, sem dependências).
- Tabuleiro: só lances legais; arrastar ou tocar peça e destino (celular); promoção vira dama;
  "Analisar posição", "Desfazer", "Reiniciar". "Anexar posição do tabuleiro" manda o FEN no chat.
- Chat: agente, confiança (barra), fontes como etiquetas que expandem o trecho; o Stockfish tem
  etiqueta própria (escura, ícone de raio). Espera longa (7–17 s) com texto por etapa e segundos.
  Qualquer erro mostra o `.resposta` do backend; sem servidor, mensagem própria; timeout de 35 s
  no cliente (acima dos 30 s do backend).
- Lições: `usuario_id` no localStorage; ao abrir, `GET /licao/atual` retoma (400 apaga o id).
- Status de `GET /health` a cada 60 s. Rodapé "Sobre" com os documentos e o aviso de que as
  respostas são geradas por IA.

## Busca multilíngue (decisões das Fases 1 e 2)
Os documentos estão em inglês e as perguntas em português.
- **Glossário PT→EN** (`GLOSSARIO` em `retrieval.py`): a pergunta é expandida no formato
  "pergunta: termos" ("roque" → "roque: castling castle"). Continua essencial: sem ele o e5
  perde cerca de metade dos acertos.
- **Modelo:** trocado na Fase 2 de `paraphrase-multilingual-MiniLM-L12-v2` para
  `intfloat/multilingual-e5-base`, medido com `eval/comparar_embeddings.py` (hoje 22 perguntas:
  5 regras, 12 fundamentos, 5 tática). Nas 18 primeiras, com o índice da época: trecho certo
  entregue (entre os 4 primeiros e acima do limiar) em 9/18 com MiniLM a 0.4 contra 14/18 com
  e5 a 0.79; MRR 0.51 → 0.69.
- **Índice fundamentos:** Capablanca + Staunton (sem listas de lances). Nas 12 perguntas de
  fundamentos: Capablanca sozinho 5/12, Staunton sozinho 7/12, os dois juntos 7/12 com MRR maior
  (0.66 x 0.61); os dois livros se completam.
- **Limiar:** os scores do e5 ficam concentrados (~0.72–0.83). A 0.79, todas as perguntas
  válidas testadas passam e 2 de 12 pares (pergunta fora do tema, índice) também passam; a 0.80,
  nenhum fora do tema passa, mas uma pergunta válida é perdida. **Na Fase 8, reavaliar modelo e
  `MIN_SCORE` com o golden set de 40 casos.** Ao trocar o modelo, rodar de novo `ingest.py`.
- Pontos fracos conhecidos: as perguntas com "cavalo" (o e5 ficou pior que o MiniLM nelas),
  "Como funciona a notação?", "Como dar mate com rei e torre?" e "princípios da abertura"
  (trecho certo em 5º, logo fora dos 4).

## Convenções
- Código e comentários em português; nomes de variáveis em português ou inglês, sem misturar no mesmo arquivo.
- Funções pequenas com type hints e docstring.
- Toda funcionalidade nova vem com teste em `backend/eval/` ou `backend/tests/`.
- Não adicionar dependências sem necessidade clara.

## Comandos
- Backend: `cd backend && uvicorn main:app --reload` (API em http://localhost:8000, docs em /docs)
- Ingestão: `cd backend && python ingest.py`
- Testes: `cd backend && pytest`
- Testes com o LLM de verdade (custam chamadas de API): `cd backend && pytest -m llm`
- Testar no terminal: `cd backend && python testar_agente.py roteador "pergunta" [--fen "FEN"]`
  (também `arbitro`, `professor`, `estrategista`, `analista`)
- Scripts de avaliação (rodam direto; cada um põe `backend/` no `sys.path`):
  - `cd backend && python eval/comparar_embeddings.py [e5]`: busca (hit@4, MRR, limiar), sem API
  - `cd backend && python eval/avaliar_roteamento.py [modelo]`: acurácia do roteador; sem
    argumento usa `CLASSIFIER_MODEL`, ex.: `python eval/avaliar_roteamento.py claude-opus-5-5`
  - `cd backend && python eval/avaliar_guardrails.py`: injeção por camada, falsos positivos e juiz
- Frontend: `cd frontend && npm install && npm run dev` (http://localhost:5173; backend em
  `VITE_API_URL`, ver `frontend/.env.example`)
- Testes do frontend: `cd frontend && npm test`; build: `npm run build`; prévia dos sprites:
  `npm run previa`
