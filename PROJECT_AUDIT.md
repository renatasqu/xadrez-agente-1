# Auditoria do Projeto

Data: **05/10/2026**, contexto do usuário em America/Sao_Paulo. Escopo: estado da cópia local, código rastreado, configurações, dependências, assets, testes e documentação. O repositório começou sem alterações indicadas por `git status --short`.

Foram inventariados 290 arquivos rastreados; fontes, testes e configurações textuais foram lidos, e assets binários foram inventariados por caminho/tamanho. Documentos e bancos locais ignorados pelo Git foram inspecionados apenas quanto à existência e estrutura/contagens necessárias. Não foram consultados valores privados de `.env`, senhas, hashes de usuários ou tokens de sessões. Documentos acadêmicos privados e internals de `.git`/dependências geradas não são código do produto.

Esta auditoria combina **evidência estática** e **verificação automatizada local**. “Implementado” significa encontrado no código; “funcionando” está limitado ao que os testes/build comprovaram. Não houve execução integrada em navegador, chamadas reais ao LLM/FIDE, reingestão, instalação de dependências ou alteração funcional. Onde falta evidência operacional, registra-se **não foi possível confirmar**. Todas as recomendações abaixo permanecem propostas.

## 1. Resumo executivo

Xadrez Multiagente é um tutor de xadrez com uma arena manipulável pelo usuário, análise Stockfish, perguntas documentais, indicações de leitura, demonstrações, 12 lições e seis exercícios fixos. O frontend React apresenta esses recursos; a API FastAPI responde consultas, valida prática e persiste parte do progresso.

**Magnus e Hans são nomes dos lados e dos painéis visuais.** A partida normal só avança por `Board.onLance`, após movimento feito pela pessoa. Não há laço de decisão de dois agentes, bot de resposta na partida, engine dedicada a cada personagem, partida remota ou comunicação por WebSocket. Os agentes reais são papéis de linguagem com roteamento documental, não os jogadores anunciados em algumas descrições da interface.

| Categoria | Estado encontrado | Evidência |
| --- | --- | --- |
| Implementada e verificada localmente | Build, movimentos/controles, componentes e fluxos pedagógicos cobertos por 190 testes frontend aprovados | `frontend/src/**/*.test.*`, resultado da seção 19 |
| Implementada, operação externa não confirmada | Tutor/LLM/RAG aberto, análise completa, atualização FIDE | `backend/agents/`, `llm.py`, `retrieval.py`, `masters.py` |
| Parcial | Entrada protegida só no frontend; progresso anônimo; formulário de cadastro desativado; área separada de curiosidades | `auth/`, `backend/main.py`, `App.tsx` |
| Código aparentemente fora do produto atual | `Avatar`, `Sidebar`, coleção textual de curiosidades, tiles da prévia e algumas funções auxiliares | Seção 21 |
| Documentação sem implementação correspondente | Magnus/Hans autônomos, RAGAS/golden set completo, backend de partidas/comentários | `Sobre.tsx`, `PROMPTS.md`, inventário de rotas |
| Conteúdo fixo/demonstrativo | Biografias, catálogo de exercícios, resumos FIDE, demonstrações, carrossel, comentário/like | Seções 12–15 e 21 |

O frontend compila, mas a suíte não está inteiramente verde: **190 aprovados / 1 falha**. O backend tem extensa suíte no repositório, mas não foi possível executá-la no Python apropriado disponível. Nesta cópia há quatro documentos locais, três coleções com **775 trechos** e cache de três ratings; um clone do Git não recebe esses dados.

## 2. Arquitetura atual

### Camadas e comunicação

- **Entrada:** `frontend/src/main.tsx` importa fontes/CSS e monta StrictMode, AuthProvider e AuthGate.
- **Produto:** `App.tsx` mantém áreas por hash, partida, chat, lições, demonstrações, análises, modais e exercício separado.
- **HTTP:** `api.ts` usa `fetch`, JSON e AbortController; `auth/authApi.ts` usa `credentials: include`. Chamadas de xadrez não enviam explicitamente credenciais entre origens.
- **API:** `backend/main.py` inclui routers de auth, Masters e exercises. Pipeline bloqueante de linguagem/engine roda no threadpool; exercícios/Masters/auth usam endpoints síncronos FastAPI.
- **Xadrez:** chess.js no cliente; python-chess no servidor; Stockfish local via UCI.
- **Linguagem:** grafo LangGraph classifica/encaminha/verifica. LangChain fornece clientes dos três provedores.
- **Conhecimento:** referências curadas ou Sentence Transformers + ChromaDB; biblioteca local PDF/TXT para leitura original.
- **Persistência:** SQLite e ChromaDB no disco do servidor. Sem ORM, servidor de banco externo, worker de fila ou infraestrutura de deploy encontrada.

```mermaid
flowchart LR
  U[Usuário] --> UI[React: AuthGate e App]
  UI --> CJ[chess.js: partida local]
  UI -->|JSON: api.ts| API[FastAPI]
  UI -->|cookie: authApi.ts| AUTH[Auth: SQLite]
  API --> ROUTER[LangGraph: roteamento e guardrails]
  ROUTER --> CURADO[Resumos FIDE curados]
  ROUTER --> RAG[Busca de documentos]
  RAG --> E5[Sentence Transformers: e5]
  RAG --> CHROMA[(ChromaDB local)]
  ROUTER --> LLM[Anthropic / OpenAI / Ollama]
  ROUTER --> ANALISTA[Analista: python-chess]
  ANALISTA --> SF[Stockfish: UCI local]
  ANALISTA --> RAG
  ANALISTA --> LLM
  API --> PROG[(SQLite: progresso e cache de lições)]
  API --> DOC[PDF/TXT locais]
  API --> MASTER[Masters: cache SQLite]
  MASTER --> FIDE[Perfis HTML FIDE]
```

Não há aresta de decisão automática entre Magnus/Hans e `CJ`: os nomes pertencem à apresentação. A autenticação está num ramo separado e não é dependência das rotas pedagógicas.

### Configurações completas

`backend/config.py:Settings` lê `.env` da raiz e de `backend`, ignorando campos extras; ambiente de processo também é suportado. Todos os nomes abaixo podem ser definidos em maiúsculas. Valores são padrões **do código**, não valores privados da instalação.

| Grupo | Variáveis e padrões |
| --- | --- |
| Provedor | `LLM_PROVIDER=anthropic`; `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` vazias; `OPENAI_MODEL=gpt-4o-mini`; `OLLAMA_MODEL=llama3.1` |
| Papéis Anthropic | `CLASSIFIER_MODEL=claude-haiku-4-5-20251001`; `AGENT_MODEL=claude-sonnet-5-5`; `JUDGE_MODEL=claude-haiku-4-5-20251001`; `ANTHROPIC_EFFORT=low` |
| Limites de linguagem | `LLM_TIMEOUT=60`; `LLM_TIMEOUT_RAPIDO=15`; `LLM_MAX_TOKENS=4000` |
| Busca | `MIN_SCORE=0.79`; `EMBEDDING_MODEL=intfloat/multilingual-e5-base`; `PREFIXO_CONSULTA='query: '`; `PREFIXO_DOCUMENTO='passage: '` |
| Caminhos de corpus | `DOCS_DIR=backend/docs`; `CHROMA_DIR=backend/chroma` (paths absolutos derivados de BASE_DIR) |
| Guardrails | `MAX_PERGUNTA=500`; `MAX_FEN=100`; `MAX_RESPOSTA=3000`; `VERIFICAR_FUNDAMENTACAO=true`; `LOG_GUARDRAILS=backend/logs/guardrails.jsonl` |
| API | `TIMEOUT_REQUISICAO=30`; `RATE_LIMIT=20/minute`; `CORS_ORIGENS=["http://localhost:5173"]`; `ADMIN_TOKEN` vazio |
| Bancos | `DB_PROGRESSO=backend/progresso.sqlite`; `DB_AUTH=backend/auth.sqlite` |
| Inicialização/auth | `AUTH_COOKIE_SECURE=false`; `AQUECER_NA_INICIALIZACAO=true` |
| Engine | `STOCKFISH_PATH=/opt/homebrew/bin/stockfish`; `STOCKFISH_TEMPO=1.0` |
| Masters, fora de Settings | `MASTERS_CACHE_PATH`: `os.environ` ou `backend/masters-ratings.sqlite`; TTL constante 86400 s |
| Frontend | `VITE_API_URL=http://localhost:8000`; `BASE_URL` é valor do Vite usado por imagens públicas |

A variável de Masters deve estar no ambiente do processo (por exemplo, exportada no terminal). Apenas escrevê-la no `.env` não implica que `os.environ` a receba. `.env.example` documenta só parte das opções; não registra auth, CORS, bancos, aquecimento ou Masters. Não há declaração de versão mínima Python em `pyproject.toml` nem dependências Python travadas em lockfile.

### Inicialização e execução

Comandos reais estão no README: venv Python 3.11 em `backend`, `pip install -r requirements.txt`, corpus/`python ingest.py` quando necessário, `python configure_owner.py`, `uvicorn main:app --reload`; em `frontend`, `npm ci` e `npm run dev`. FastAPI cria tabelas de progresso no lifespan e carrega embeddings/abre Chroma se habilitado; auth cria tabelas ao conectar. Uma falha de download/cache do modelo pode impedir a API inteira de subir, incluindo login e exercícios que não precisam dele.

## 3. Fluxo completo da aplicação

1. Vite entrega `index.html`; React monta AuthProvider e AuthGate em StrictMode.
2. AuthProvider remove a antiga chave de sessão demo e chama `GET /auth/session` com cookie. Uma falha deixa o usuário sem autenticação; não há sessão offline simulada.
3. AuthGate aguarda a verificação. Sem usuário, aceita `#/login` e `#/cadastro`; outros hashes redirecionam para login. Autenticado em login/cadastro ou sem hash, redireciona para `#/partida`.
4. AuthPage valida campos e chama login; cadastro passa pela validação visual, mas `register()` lança erro de recurso desativado. Login correto muda hash e usuário do Context.
5. App monta FEN inicial e histórico `[FEN_INICIAL]`, sem buscar partida no backend. StatusSaude consulta `/health`, repetindo a cada 60 s.
6. Se existe UUID no localStorage, consulta a lição atual uma vez; 400 apaga UUID inválido, outros erros são silenciosos nesse efeito. Não há relação entre esse UUID e a conta autenticada.
7. Usuário move peça; chess.js valida, devolve FEN e App acrescenta histórico. Não ocorre chamada HTTP por lance normal.
8. Pedir análise envia apenas o FEN atual da partida. Resultado vai para o chat e para o painel do lado que jogava na posição analisada; depois de um lance aparece indicação de análise antiga.
9. Tutor mantém mensagens locais, envia apenas a pergunta atual e FEN opcional. “Qual documento me ajuda?” chama `/recomendar`, que pode usar classificador LLM mesmo sem redigir resposta por agente.
10. Lições usam UUID e `/licao/proxima`; cache é compartilhado entre usuários. Avanço ocorre somente com fontes, sem prova de leitura/domínio.
11. Demonstração coloca o tabuleiro em modo de leitura e toca passos a cada 1200 ms. Histórico pessoal continua intacto.
12. Prática fecha o modal/demo e carrega um exercício fixo. O servidor controla FEN/history resultantes. Fechar prática restaura o tabuleiro pessoal.
13. Navegar para Masters/Lições/Sobre/Curiosidades/home define pausa. A arena permanece montada e oculta; efeitos de componentes montados, como polling de saúde/carrossel, podem continuar.
14. Logout revoga sessão e desmonta App; UUID fica no navegador. Partida/chat em memória se perdem. Não há expiração de sessão acompanhada por polling no frontend.

## 4. Inventário de telas e rotas

Arquivo coordenador das áreas autenticadas: `frontend/src/App.tsx:46–49`, `pageFromHash`. Hashes não reconhecidos caem na partida. Arquivo coordenador de acesso: `auth/AuthGate.tsx`. A barra muda hashes com âncoras; não há roteador com contrato centralizado.

| Nome / URL | Arquivos/componentes | Funcionalidades e backend | Estado e problemas |
| --- | --- | --- | --- |
| Login `/#/login` | AuthGate, AuthPage, AuthContext, authApi | Validação, mostrar senha, POST login, GET sessão | loading, user, errors, submitting; depende da API; cookie só em `/auth` |
| Cadastro `/#/cadastro` | AuthPage `register=true` | Campos nome/e-mail/senha/confirmação; nenhum endpoint de criação | errors/showPassword; submissão sempre recusa; texto “É uma demo” diverge do acesso pessoal |
| Partida `/#/partida` e `/#partida` | App, Board, MatchControls, AgentHeaderCard, CurrentTurn, MoveHistory, AgentThinking | Movimentos locais; `/analisar`, health; acesso a tutor/lições | histórico FEN, pausa, índice, clocks, análises; não há bots nem gravação da partida |
| Histórico `/#historico-partida` | MatchArena.MoveHistory, MatchControls | Expande details e mostra posições gravadas, sem backend | expanded/selectedPosition/historyPlaying; não é histórico de várias partidas |
| Análises `/#agentes` | AgentThinking em MatchArena | Dados de `/analisar` já recebidos; links de documentação | analyses por w/b; extração por regex do texto, sem contrato numérico dedicado |
| Masters `/#/masters` | Masters.tsx + Masters.css | GET `/masters/ratings`; três cartões/biografias locais | ratings/loading; atualiza quando visible passa a true, sem polling diário no cliente |
| Lições `/#/licoes` | App lessonsContent, Licao, RespostaDoAgente, Carregando | GET atual/POST próxima; CTAs de prática/demo | licao/lessonError/esperando; catálogo de exercícios só acessível por associações |
| Sobre `/#/sobre` | App + ContentModal + Sobre(section=about) | Abre modal, sem API direta | modal/page; não existe seção de página com esse conteúdo; arena fica oculta; texto promete autonomia não implementada |
| Curiosidades `/#/curiosidades` | App, seção standalone | Frase “Este espaço vai reunir…”; sem API | page; placeholder; sem link na navegação atual |
| Home autenticada `/#/` | App seção home | Chamada visual “Iniciar partida”; sem API | page; login redireciona à arena, não à home |
| Tutor, sem URL própria | ContentModal, Chat, Mensagem, Fontes, OndeLer, ContextoModal | `/chat`, `/recomendar`, `/documentos/.../contexto` | itens do App, texto/modo/anexar locais; histórico não enviado ao LLM |
| Lições em modal, sem URL própria | ContentModal + lessonsContent | Mesmos endpoints de lições | mesmo estado compartilhado da área de Lições |
| Comentário/like, sem URL própria | ContentModal + CommentLike | Nenhuma API | liked/comment/feedback locais; envio explicitamente demonstrativo |
| Documentação, sem URL própria | ContentModal + Sobre(section=documentation) | Links a análises e tutor, sem arquivo Markdown carregado | fontes tooltip; não é página da documentação FastAPI nem renderização do README |
| Curiosidades em modal | ContentModal em App | Apenas placeholder | Existe ramo modal, mas gatilho atual não localizado; carrossel não o abre |
| Atalhos flutuantes | FloatingAction + InteractiveCard | Abrem tutor/lições | ocultos quando algum modal abre; imagens PNG locais |

Os hashes de partida têm grafias inconsistentes: `practiceFromArea`/`demonstrationFromArea` escrevem `#partida`, login escreve `#/partida`, HeaderNavigation usa `#partida`. Ambos funcionam pelo fallback; indicação `aria-current` pode não coincidir após login. Não há rota dedicada Magnus, Hans, análises HTTP do frontend, exercícios ou biblioteca. `/docs`, `/redoc`, `/openapi.json` pertencem à API, no domínio/porta do backend.

## 5. Inventário de componentes

Prefixo dos caminhos de apresentação: `frontend/src/`. “Ativo” significa montado/importado pelo produto atual, mesmo se temporariamente hidden. Dependências globais React/TypeScript não são repetidas em toda linha.

| Arquivo/export | Responsabilidade e onde usado | Props principais / estado / dependências | Situação e comportamento |
| --- | --- | --- | --- |
| `App.tsx` App | Coordena todas as áreas autenticadas | onLogout; useState/useRef/useMemo; api/useExercise/useMatchLayout | Ativo, concentra estado e orquestração; não persiste partida |
| `auth/AuthContext.tsx` AuthProvider/useAuth | Sessão em main/AuthGate/AuthPage | children; user/loading; authApi | Ativo; restaura sessão real, registro desativado |
| `auth/AuthGate.tsx` AuthGate | Guarda visual de entrada | hash/logoutError, useAuth | Ativo; não autoriza endpoints backend |
| `auth/AuthPage.tsx` AuthPage | Formulários login/cadastro | register; errors/submitting/showPassword; imagens | Ativo; cadastro só UI, valida antes de negar |
| `components/Board.tsx` Board | Tabuleiro em App | fen, modo, ocupado, callbacks, exercicio/exibicao; selecionada; react-chessboard/chess.js | Ativo; três modos; exercício nunca move otimisticamente |
| `components/BoardControls.tsx` | Analisar/desfazer/reiniciar em MatchControls e modo Board compatível | ocupado/podeDesfazer/callbacks; sem estado | Ativo; não aplica melhor lance automaticamente |
| `match/MatchControls.tsx` | Navegação/reprodução/pausa | index/total/paused/disabled e callbacks | Ativo; controles da partida, não relógio competitivo |
| `match/MatchArena.tsx` PixelAvatar | Avatar SVG em cards/turno/análises | side/size/context; AVATARES/Sprite; memo | Ativo; personagens das grades |
| Mesmo arquivo, AgentHeaderCard | Cabeçalho Magnus/Hans em App | side/active/seconds | Ativo; contador de atividade recebido, sem countdown |
| Mesmo arquivo, CurrentTurn | Turno/estado de exibição na lateral | side/label | Ativo; usa lado do FEN mostrado |
| Mesmo arquivo, MoveHistory | Lista SAN da partida local | moves/selected/onSelect/disabled; expanded e matchMedia | Ativo; details responsivo e botões de posições |
| Mesmo arquivo, AgentThinking | Resumo e detalhes da análise | side/analysis/busy/stale; textoDaAnalise | Ativo; parseia strings com regex; não vê raciocínio interno do modelo |
| Mesmo arquivo, Sidebar | Navegação vertical antiga | Sem props/estado | Export sem consumidor localizado no produto; aparentemente legado |
| `match/useMatchLayout.ts` | Medição responsiva usada por App | active; ref/mobile; ResizeObserver/visualViewport | Ativo; escreve variável CSS `--chrome-h`; só apresentação |
| `components/Chat.tsx` | Tutor no modal | itens/esperando/onEnviar/onVerNoTabuleiro/onPractice; texto/anexar/modo | Ativo; Enter envia, Shift+Enter quebra linha, limite 500 |
| `components/Mensagem.tsx` Pergunta/RespostaDoAgente | Mensagens em Chat/Lições | texto ou resposta/erro/callbacks; sem estado local | Ativo; negrito simples como elementos React, fontes/confiança/CTAs |
| `components/Fontes.tsx` | Fontes expandíveis em Mensagem | fontes; aberta; idioma/Sprite | Ativo; Stockfish identificado como engine, sem link PDF próprio |
| `components/OndeLer.tsx` | Leitura documental em Mensagem | itens; aberto; urlDoDocumento | Ativo; PDF em nova aba, TXT em modal contextual |
| `components/ContextoModal.tsx` | Contexto TXT em OndeLer | item/onFechar; contexto/erro; api | Ativo; Escape/foco inicial; outer modal ajuda a conter foco |
| `components/TextoComDestaque.tsx` | Marca substring em trecho | texto/destaque; sem estado | Ativo; não injeta HTML |
| `components/Carregando.tsx` | Espera no chat/lições | tipo; segundos; etapas.ts | Ativo; mensagens de etapa são estimativas pelo tempo, sem telemetria servidor |
| `components/Licao.tsx` | Lição/avanço em lessonsContent | licao/concluido/ocupado/onProxima/relatedExerciseIds/onPractice | Ativo; não exige exercício para próxima lição |
| `components/RelatedPractice.tsx` | CTAs em Mensagem/Licao | ids/onPractice/disabled; labels fixos | Ativo; deduplica IDs; sem catálogo navegável geral |
| `components/ExercisePanel.tsx` | Estado/feedback/prévia de exercícios no App | state/visual/callbacks; passo/progress/progressError; api/chess.js | Ativo; SIM/NÃO, dicas, refutação, consulta progresso após resultado |
| `exercises/useExercise.ts` | Sessão de prática em App | reducer + refs atual/geracao/ocupado | Ativo; ignora respostas de geração antiga, bloqueia duplicatas simultâneas |
| `components/Reprodutor.tsx` | Reprodução de demonstração | descricao/passos/passo/tocando/callbacks | Ativo; estado no App, animação via timeout 1200 ms |
| `components/ContentModal.tsx` | Shell de todos os modais principais | id/title/open/onClose/children/returnFocusRef | Ativo; Escape, Tab, scroll lock, restaura foco; mantém filhos montados quando hidden |
| `components/InteractiveCard.tsx` | Botão/tooltip em CTAs e FloatingAction | button props/action/tooltipTitle/ref; hovered/focused/dismissed/position | Ativo; tooltip por portal, adapta posição, Escape dispensa |
| `components/FloatingAction.tsx` | Atalhos do App | title/label/icon/onClick | Ativo; envolve InteractiveCard, sem lógica de backend |
| `components/HeaderNavigation.tsx` | Menu do header | onExit; active/open/preferences | Ativo; onLessons/onCuriosities declarados mas não usados; preferences nunca recebe true |
| `components/BrandLogo.tsx` | Logo em header | Sem props/estado; imagem pública | Ativo; âncora #partida |
| `components/StatusSaude.tsx` | Luz/latência do header | saude/latencia/offline; intervalo 60 s | Ativo; não testa chamada real ao LLM, só disponibilidade declarada |
| `components/Masters.tsx` | Página Masters | visible; ratings/loading; imagens/API/CSS | Ativo; evita fetch quando invisível; biografias fixas |
| `components/CuriositiesCard.tsx` | Carrossel na arena | index/previous/hovered/focused/remaining | Ativo; quatro PNGs, 10 s, preserva tempo restante ao pausar |
| `components/CommentLike.tsx` | Modal de interação demonstrativa | liked/comment/feedback | Ativo; sem persistência, mensagem explícita de não publicação |
| `components/Sobre.tsx` | Sobre/documentação | section/onTutor/onAnalyses; tooltip hover/focus | Ativo; texto de autonomia/privacidade desatualizado |
| `components/Avatar.tsx` | Avatar antigo por gelo/fogo | lado; Sprite/AVATARES | Import de componente não localizado; substituído visualmente por PixelAvatar |
| `pixel/Sprite.tsx` | Renderiza grade como SVG | grade/paleta/rotulo/tamanho/margem/className | Ativo em peças, ícones e avatares |
| `pixel/PecaSprite.tsx`, `pixel/pecas.ts` | Peças personalizadas do react-chessboard | lado/tipo; mapa PECAS_DO_TABULEIRO | Ativos; rótulos acessíveis em português |

Módulos ativos de apoio: `lances.ts` (regras locais), `demonstracao.ts` (SAN e passos), `idioma.ts` (rótulos/texto), `acessibilidadeTabuleiro.ts` (MutationObserver que traduz mensagens de arraste), `armazenamento.ts` (UUID), `types.ts` (contratos), `exercises/estado.ts` (reducer), `visual.ts` (facts para casas), `pedagogia.ts` (feedback fixo), `refutacao.ts` (replay seguro). Fixtures em `src/testes/` pertencem à verificação, não são a origem dos dados de produção.

## 6. Inventário do backend

### Contratos gerais

`backend/schemas.py` define `Resposta`: resposta, fontes, agente, confianca, onde_ler, demonstracao, concept_ids e related_exercise_ids. Sem fontes, confiança maior que zero é recusada. `RespostaLicao` envolve usuário, conclusão, metadados, conteúdo e associações.

`backend/exercises/models.py` usa unions discriminadas para goal/action/fact, `extra=forbid`, frozen e números/booleanos estritos. `ValidationResult` contém status (`correct/incorrect/partial`), resulting_fen, facts, next_hint (opcional, não preenchido pelos validadores atuais) e history UCI. Erros são `{code,message}`.

### Todos os endpoints implementados

Abreviações de chamadas frontend são métodos de `src/api.ts`, exceto authApi. Sem autenticação significa ausência de validação de sessão na rota; CORS continua aplicável ao navegador.

| Método / rota | Arquivo / função | Entrada | Resposta | Autenticação / limites | Consumidor frontend |
| --- | --- | --- | --- | --- | --- |
| GET `/health` | `main.py:health` | Sem parâmetros | Saude: status, stockfish, indices, chave_api, llm_provider | Nenhuma; sem rate limit | api.saude → StatusSaude |
| POST `/chat` | `main.py:chat` | EntradaChat: mensagem (schema até 2000), fen opcional (até 200); guardrails 500/100 | Resposta | Nenhuma; rate_limit e timeout de pipeline | api.perguntar → App.perguntar/Chat |
| POST `/recomendar` | `main.py:recomendar` | EntradaRecomendacao: mensagem | Resposta com fontes curadas OU onde_ler | Nenhuma; rate_limit/timeout | api.recomendar → modo de leitura do Chat |
| POST `/analisar` | `main.py:analisar`, `analisar_fen` | EntradaAnalise: fen | Resposta de Analista ou bloqueio | Nenhuma; rate_limit/timeout | api.analisar → controles/App.analisar |
| GET `/progresso/exercicios` | `main.py:progresso_dos_exercicios` | query usuario_id UUID obrigatório | Lista ProgressoExercicio | Nenhuma; rate_limit | api.progressoExercicios → ExercisePanel |
| POST `/licao/proxima` | `main.py:licao_proxima`, `entregar_proxima` | usuario_id opcional; cria UUID se ausente | RespostaLicao; avança só com fontes | Nenhuma; rate_limit/timeout | api.proximaLicao → App/Licao |
| GET `/licao/atual` | `main.py:licao_atual`, `ler_atual` | query usuario_id obrigatório | RespostaLicao; 404 sem lição anterior | Nenhuma; rate_limit/timeout | api.licaoAtual → retomada no App |
| GET `/documentos/{nome}` | `main.py:documento` | nome de arquivo na allowlist | FileResponse inline PDF/TXT, nosniff | Nenhuma; rate_limit | urlDoDocumento → link PDF OndeLer |
| GET `/documentos/{nome}/contexto` | `main.py:contexto_do_trecho` | nome e query chunk_id | ContextoDoTrecho: antes/trecho/depois e metadados | Nenhuma; rate_limit | api.contexto → ContextoModal |
| POST `/ingest` | `main.py:ingest`, `reingerir` | header X-Admin-Token | `{chunks: {indice: quantidade}}` | ADMIN_TOKEN não vazio e compare_digest; 1/minute; sem timeout de 30 s | Não consumido pelo frontend |
| POST `/auth/login` | `auth.py:login` | Login: email até 254, password 1–1024 | `{name,email}` + cookie; 401 incorreto | Sem sessão prévia; Origin validado se presente; 5/minute | authApi.login → AuthContext |
| GET `/auth/session` | `auth.py:session` | Cookie xadrez_session opcional | `{name,email}` ou null | Valida hash/expiração do cookie; sem rate limit | authApi.session → AuthProvider |
| POST `/auth/logout` | `auth.py:logout` | Cookie opcional, corpo não usado | `{ok:true}`, remove cookie/sessão | Origin validado se presente; funciona sem sessão | authApi.logout → AuthContext/HeaderNavigation |
| GET `/masters/ratings` | `masters.py:ratings`, `get_ratings` | Sem parâmetros | RatingsResponse: updated_at, masters, stale, source | Nenhuma; sem slowapi; TTL próprio | api.mastersRatings → Masters |
| GET `/exercises/{exercise_id}` | `exercises/api.py:read_exercise` | exercise_id do catálogo | Exercise; 404 se ausente | Nenhuma; sem slowapi | api.exercicio → useExercise.carregar |
| POST `/exercises/{exercise_id}/validate` | `exercises/api.py:validate_exercise` | ValidationRequest: version, action, history; query usuario_id UUID opcional | ValidationResult; registro opcional de tentativa | Nenhuma; sem slowapi/timeout do pipeline | api.validarExercicio → useExercise.tentar |
| POST `/exercises/{exercise_id}/hint` | `exercises/api.py:request_hint` | HintRequest: version, history, last_action opcional, current_hint_level 0–3 | `{next_hint: Hint ou null}` | Nenhuma; sem slowapi/timeout do pipeline | api.dicaExercicio → useExercise.pedirDica |

Rotas automáticas de `FastAPI(title="Xadrez Agente")`: **GET `/openapi.json`**, **GET `/docs`**, **GET `/docs/oauth2-redirect`** e **GET `/redoc`**; documentação/schema públicos, sem OAuth configurado nem consumidor no frontend. Métodos auxiliares automáticos dependem da versão FastAPI; o método relevante de documentação é GET. Não existe `/auth/register`, endpoint de jogada normal, criação/listagem de partidas, comentários, likes, usuários públicos ou listagem geral de exercícios.

### Erros e serviços

- Main normaliza 422, 404/405, 429, 503, 504 e 500 para Resposta. Rotas de exercícios têm handlers próprios e wrapper APIRoute que normaliza erros esperados.
- `ingerindo` é um threading.Event; pipelines recusam durante reingestão. Não bloqueia atomicamente todas as buscas em outros workers nem cálculos já iniciados.
- `obter_llms()` retorna dependência substituível nos testes; não instancia cliente antes da requisição.
- `executar()` usa `asyncio.wait_for(run_in_threadpool(...))`; timeout devolve 504, mas não interrompe a thread.
- `tem_chave_api()` só verifica string da chave; para provedor desconhecido considera valor padrão positivo. Não comprova acesso/modelo funcional.
- Exercícios são stateless; persistência é callback `app.state.exercise_recorder`. SQLite de progresso é inicializado no lifespan da aplicação principal.

## 7. Fluxo de dados

### Pergunta documental

```mermaid
sequenceDiagram
  participant U as Usuário
  participant UI as Chat/App
  participant API as FastAPI
  participant R as Router/Guardrails
  participant D as Referências ou Chroma
  participant L as LLM agente/juiz
  U->>UI: Pergunta e opção de anexar posição
  UI->>API: POST /chat: mensagem, fen?
  API->>R: Threadpool com timeout
  R->>R: Limpeza, limites e padrões
  R->>L: Classificação de tema/injeção
  R->>D: Índice escolhido; fallback se necessário
  D-->>R: Trechos e metadados controlados
  R->>L: Redigir a partir de trechos; verificar fontes
  L-->>R: Saída estruturada e veredito
  R->>R: Checar saída e associar prática/demo
  R-->>API: Resposta
  API-->>UI: JSON
  UI-->>U: Texto, confiança, fontes e CTAs
```

Lições com categoria fixa pulam entrada/classificador, pois usam perguntas controladas. Recomendações usam classificador, mas não agente de redação/juiz. Leitura original consulta arquivo/trecho; não precisa gerar texto novo com LLM.

### Exercício e análise

```mermaid
flowchart TD
  A[Tentativa move ou answer] --> B[useExercise: version + history]
  B --> C[API resolve catálogo do servidor]
  C --> D[python-chess e busca limitada]
  D --> E[ValidationResult: FEN, facts, status, history]
  E --> F{UUID enviado?}
  F -->|sim| G[SQLite: tentativa e conclusão monotônica]
  F -->|não| H[Sem registro de progresso]
  G --> I[Frontend usa FEN autoritativo]
  H --> I
  J[Analisar FEN pessoal] --> K[Stockfish: score e PV]
  K --> L[Busca de ideias em livros]
  L --> M[LLM explicador e juiz]
  M --> N[Resposta com fatos da engine e demo]
  N --> O[Chat + painel do lado atual]
```

Requisição não inclui soluções fornecidas pelo cliente, catálogo mutável, identidade autenticada ou seleção de defesa adversária. Na partida normal, o fluxo encerra no chess.js/frontend; servidor só participa quando a pessoa pede recursos pedagógicos/análise.

## 8. Sistema de xadrez

### Representação, movimentos e histórico

`frontend/src/lances.ts` cria FEN inicial com Chess. Cada movimento recria `new Chess(fen)`, executa `.move({from,to,promotion:"q"})` e devolve FEN. Clique destaca destinos legais e seleciona peças do lado a jogar; drag inválido retorna false. Roque, en passant e xeque são delegados a chess.js. Não há seletor de promoção: sempre dama.

`App.tsx:57` guarda array de FENs. `recordedMoves()` em MatchArena reconstrói SAN procurando, entre movimentos legais da posição anterior, aquele cujo `after` coincide com o FEN seguinte. Não existe PGN persistido, exportação, abertura de FEN arbitrário pela arena, importação de partidas ou sincronização entre usuários.

**Limitação de repetição:** recriar Chess de cada FEN descarta a pilha de lances. `situacao()` também usa Chess(fen); FEN sozinho não preserva informação suficiente para empate por repetição tripla. Regras dependentes de contadores podem usar halfmove do FEN, mas não equivalem a um histórico completo. O backend analisa FEN isolado, com a mesma falta de histórico para repetição.

### Magnus e Hans

`MatchArena.tsx:agent` mapeia w → Magnus/gelo, b → Hans/fogo; cabeçalho/turno usam isso. `analyses` do App guarda uma resposta por lado associada ao FEN. Não existe prompt “Magnus” ou “Hans” no backend, personalização de estilo de jogo por personagem nem cálculo de adversário na partida normal.

`activity` incrementa a cada segundo para o lado da vez após o primeiro movimento, se não pausado/observando/exercitando/esperando/demo/jogo terminado. É tempo de atividade; começa em zero, não determina derrota e não possui controle FIDE. Pode acumular atraso de timers; não usa tempo monotônico para relógio competitivo.

### Engine e avaliação

`backend/agents/analista.py:analisar_posicao` valida FEN, verifica mate/afogamento/material insuficiente e, se não terminal, abre `SimpleEngine.popen_uci`. Analisa com limite de tempo (`1 s` padrão), fecha em finally, lê `score.white()` e até três movimentos da PV, validando-os de novo.

Avaliação em centipeões usa perspectiva das brancas, convertida pelo código em posição equilibrada/pequena vantagem/vantagem clara/decisiva. Mate também considera perspectiva branca. Melhor lance é SAN e pode ser traduzido para letras portuguesas. Engine é fonte independente (`documento="stockfish"`); LLM não escolhe o lance.

`caracteristicas_do_lance()` calcula captura, promoção, roque, desenvolvimento, centro, xeque e garfo geométrico. O diagnóstico de garfo não comprova ganho forçado; prática relacionada treina o conceito em outro FEN. Não há MultiPV, controle de força/Elo, análise de partida inteira, classificação de erros ou comparação de qualidade de cada movimento do usuário.

### Análise e explicação

`App.analisar` envia `fen`, não `shownFen`. Controles normais desabilitam análise ao observar posição anterior ou durante demo/exercício; o tutor ainda pode anexar o FEN pessoal. Isso significa que “posição anexada” não é necessariamente a posição visual da demonstração/exercício. A explicação do melhor lance procura ideias em estrategia e depois fundamentos, usando fatos de engine no prompt; ausência de explicação produz texto de fallback quando o pipeline chega ao fim.

**Fragilidade:** `explicar_lance()` cria LLM antes de procurar/retornar fallback; sem chave lança LLMNaoConfigurado. Erro de coleção ausente também não é “sem trechos”. `/analisar` não captura esses casos específicos antes do handler geral 500, portanto análise numérica completa não é garantida sem linguagem/corpus. A ausência de documentação ou cliente LLM pode impedir a exibição de fatos já calculados.

### Reiniciar, desfazer e replay

- Reiniciar limpa histórico, índice selecionado, reprodução, pausa, atividade e análises. Não limpa chat/UUID/lição. Não reinicia automaticamente demonstração ou sessão de exercício; os controles dessas situações estão bloqueados.
- Desfazer remove o último FEN; análises/clocks não são revertidos para valores históricos. Aviso stale evita apresentar análise antiga como atual, mas não equivale a recalcular.
- Primeira/anterior/próxima/posição atual alteram apenas índice de exibição; demonstração de histórico bloqueia movimentação. Reproduzir histórico usa 1200 ms por passo.
- Demonstrações curadas são 14 entradas em `agents/demonstracoes.py`: roque curto/longo, en passant, promoção, seis peças, xeque, mate, afogamento e notação. Não são geradas pelo LLM. A linha de análise vem da PV.
- `demonstracao.ts` revalida SAN e para na primeira jogada inválida; `refutacao.ts` exige coerência do replay com resulting_fen. Essas prévias não modificam o histórico pessoal.
- `match-context-strip` está explicitamente `hidden` (`App.tsx:294`); Board envia por portal para ela contexto e `situacao`. Assim o status textual de xeque/mate fica oculto na arena atual, embora o código o calcule. CurrentTurn permanece visível, sem substituir todos esses avisos.

## 9. Sistema de IA

### Provedores/modelos

`backend/llm.py:criar_llm` implementa Anthropic/ChatAnthropic, OpenAI/ChatOpenAI e Ollama/ChatOllama. Os modelos configurados são nomes do repositório, não afirmação de disponibilidade atual: Anthropic usa classifier/judge Haiku e agent Sonnet; OpenAI usa OPENAI_MODEL para todos os papéis; Ollama usa OLLAMA_MODEL para todos.

Haiku recebe temperature zero; outros modelos Anthropic recebem output_config effort, beta e fallbacks especificados pelo código. OpenAI recebe temperature zero/max_tokens; Ollama num_predict. Compatibilidade dessas opções/modelos com SDKs e serviços reais **não foi possível confirmar**. Não houve necessidade de consultar documentação externa para descrever o código auditado.

### Partes que realmente usam modelos

| Uso | Arquivo / função / prompt | Entrada e saída | Fallback e erro |
| --- | --- | --- | --- |
| Classificação/segurança de tema | `agents/router.py:classificar_com_llm`, PROMPT_CLASSIFICADOR | Pergunta escapada, FEN textual trocado por [posição]; Classificacao categoria/motivo/injeção | Saída inválida → ERRO_FORMATO; tema externo/injeção → recusa; erro API → indisponibilidade |
| Árbitro/Professor/Estrategista | `agents/base.py:montar_prompt`, REGRAS + Agente.papel; responder_com_documentos | Pergunta e trechos numerados; RespostaLLM resposta/ids/confiança | Sem trechos/IDs válidos → Não encontrei; duas tentativas para formato inválido; fallback entre índices no router |
| Explicação da engine | `agents/analista.py:montar_prompt_explicacao`, PROMPT_EXPLICACAO | Fatos Stockfish, trechos e pergunta; RespostaAnalise explicacao/ids/confiança/lances | Tenta estrategia/fundamentos; erro API da explicação retorna None; falhas de configuração/coleção podem escapar |
| Juiz de fundamentação | `guardrails.py:verificar_fundamentacao`, PROMPT_JUIZ | Resposta + fontes e opcionalmente fatos engine; Verificacao sim/parcial/nao | nao remove resposta/fontes; parcial ou None limita confiança a 0.5 e avisa; erro API → None |
| Embeddings/semelhança de frases | `ingest.py:gerar_embeddings`, `onde_ler.py:similaridades_por_embedding` | Texto prefixado query/passage; vetores normalizados | Trava RLock; modelo cacheado; sem fallback geral para erro de download/modelo |

### Prompts e responsabilidades

REGRAS manda usar somente trechos, responder em português, não seguir instruções contidas nos documentos e indicar IDs de fonte. PROMPT_CLASSIFICADOR decide regras/fundamentos/estrategia/analise/fora_do_tema. Regras locais corrigem movimento/notação e direcionam pedidos de posição ao Analista. PROMPT_EXPLICACAO manda preservar números/lances do motor e explicar usando livros. PROMPT_JUIZ compara afirmações com fontes, aceitando tradução e fatos calculados.

`chamar_estruturado` usa `with_structured_output(schema, method="json_schema")`, tenta duas vezes para ValidationError/OutputParserException. Não há memória conversacional, histórico de mensagens no payload, treinamento/fine-tuning, agente com ferramentas de navegação, streaming ou execução autônoma contínua.

### Interface que não é geração de IA

Relógios, animações “pensando”, etapas por segundos, biografias, curiosidades em PNG, exercícios, dicas, associação de conceitos, fontes e demos curadas são lógica/dados locais. `AgentThinking` mostra texto já recebido; não expõe chain-of-thought do modelo. Stockfish usa busca de xadrez, não modelo de linguagem; modelos AlphaZero/Leela não são importados/executados.

### Limites das garantias

O juiz e a confiança não medem taxa objetiva de acerto. Confiança vem do LLM e ajustes do código; a análise sem explicação teria confiança zero mesmo com fonte Stockfish. `lances_permitidos` aceita lance da PV **ou qualquer lance legal no FEN**, embora o prompt peça apenas PV; não garante exclusividade das sugestões. A checagem depende da lista `lances_mencionados` declarada pelo modelo: não há parser que extraia todos os lances do texto. Não se pode afirmar que todo lance em toda resposta foi validado.

## 10. Documentos / conhecimento / RAG

**Existe RAG real**, além de caminho curado sem embeddings.

1. `config.DOCUMENTOS` contém cinco arquivos em três índices: FIDE → regras; Capablanca/Staunton → fundamentos; Regis/Lasker → estrategia.
2. `ingest.py` lê PDF com pypdf e TXT em UTF-8; TXT é separado em blocos de 80 linhas. Não há OCR de PDF escaneado.
3. Limpeza remove menu FIDE, títulos repetidos, diagramas ilegíveis e marcas Gutenberg; filtra listas de lances de Staunton quando mais de 40% das linhas são transcrições.
4. Divide em até 800 caracteres, sobreposição 100, mínimo 60. Metadados registram documento/título/página ou linhas/local/índice/chunk_id e seção quando detectável.
5. Modelo e5 multilíngue recebe `passage: ` para documentos e `query: ` para consultas; vetores normalizados. RLock serializa carregamento/geração por processo.
6. Chroma PersistentClient mantém coleções com distância de cosseno. `buscar` retorna até quatro trechos e filtra score `1-distancia >= MIN_SCORE`.
7. Glossário expande vocabulário português para inglês; classificador limita tema antes da busca. Busca pode tentar outros índices após ausência de resposta apoiada.
8. Perguntas básicas exatamente reconhecidas por regex usam `regras_curadas.fontes_para`, com `chunk_id=curado:fide:*` e score 1. Essa constante não é similaridade aprendida nem prova automática de exatidão.
9. `onde_ler` escolhe no máximo três trechos próximos do melhor score (margem 0.03), elimina duplicatas e destaca frase por embeddings. Não usa LLM para ordenar/destacar. Resumos curados não ganham chunk navegável inventado.
10. `documentos.py` serve somente nomes na allowlist, sem symlink/subpasta, extensões permitidas. Contexto verifica que chunk pertence ao documento e devolve até dois parágrafos antes/depois, incluindo blocos vizinhos.

### Corpus observado

Arquivos locais: FIDE PDF, Capablanca TXT, Staunton TXT e Regis PDF. Lasker ausente. Não são rastreados: `.gitignore` ignora `backend/docs/*`, exceto `.gitkeep`. A presença do nome não valida origem/licença/conteúdo; não foi feita leitura acadêmica completa dos livros nem conferência contra fontes oficiais.

Inspeção **somente leitura** de `backend/chroma/chroma.sqlite3` encontrou: regras 120, fundamentos 549, estrategia 106; total 775 embeddings. Coleções presentes não comprovam modelo/schema atualizado, relevância ou correspondência exata com documentos atuais. Não houve reingestão nem consultas semânticas reais.

### Ingestão e falhas

`ingerir()` apaga e recria cada coleção, avisa sobre arquivos faltantes e continua; pode deixar índice vazio ou atualização parcial se falhar no meio. `POST /ingest` sinaliza um Event e limpa cache de lições/contexto após sucesso. O script CLI não limpa esses caches SQLite. Event/checagem prévia não é bloqueio interprocesso nem swap atômico; buscas já em andamento podem concorrer. Essas limitações devem orientar futura atualização do corpus.

## 11. Autenticação e segurança

### Implementação

`backend/auth.py` tem tabelas users(email,name,salt,password_hash) e sessions(token_hash,email,expires). Provisionamento é CLI `configure_owner.py`, com senha solicitada por getpass. Login normaliza e-mail, deriva senha por scrypt com salt aleatório, compara com hmac.compare_digest e usa salt simulado para usuário inexistente. Banco recebe modo 0600 no provisionamento.

Token aleatório `token_urlsafe(32)` vai em cookie `xadrez_session`; SQLite guarda SHA-256 do token. Expiração de sete dias, HttpOnly, SameSite=lax, Secure configurável e path `/auth`. Sessão é restaurada por join de usuário/sessão válida. Logout apaga token do banco e cookie. Login/session retornam Cache-Control no-store. Expiradas são limpas no login; não há renovação, recuperação de senha ou gerenciamento de sessões na UI.

`configure_owner` faz INSERT OR REPLACE da conta informada e remove sessões daquele e-mail; não apaga outras contas já provisionadas. “Conta pessoal” é o modo de uso, não uma restrição SQL a exatamente um usuário.

### Proteções existentes

- Rate limit por IP em auth/login e rotas legadas selecionadas; limites em memória.
- Origin no login/logout, quando header existe; CORS credenciado com origem explícita, métodos GET/POST e headers Content-Type/X-Admin-Token.
- ADMIN_TOKEN comparado em tempo constante e endpoint desativado sem configuração.
- Pydantic limita entradas; regras/exercícios validam legalidade no servidor.
- Allowlist e resolução de paths impedem servir `.env`/arquivos arbitrários; symlinks são recusados.
- React renderiza texto e negrito em elementos, sem dangerouslySetInnerHTML localizado no fluxo de respostas.
- Chaves de LLM pertencem ao backend; `.gitignore` ignora `.env`, bancos/logs e arquivos de chave. Nenhum valor real foi transcrito nesta auditoria.

### Riscos concretos

**Autorização ausente:** `/chat`, `/analisar`, `/licao`, `/exercises`, `/progresso`, `/documentos` e `/masters` não têm dependência de sessão. Cookie path `/auth` não chega às demais rotas e o transporte de xadrez não inclui credenciais cross-origin. Login protege o visual, não as operações, custos LLM ou leitura/mutação de progresso. CORS não impede scripts/servidores externos de chamar API.

**UUID não identifica conta:** quem possui/sabe o UUID consegue ler/alterar o progresso correspondente sem checagem de propriedade. Não há vinculação com email da sessão, separação por conta no navegador, idempotência de tentativa ou limite global de gasto.

**Rotas computacionais expostas:** validação/dica fazem busca local limitada porém enumerativa, sem slowapi. Chamadas podem ocupar threads/CPU; rate limit antigo não cobre namespace exercises.

**Transporte:** Secure=false é adequado apenas ao desenvolvimento HTTP local. TLS/proxy/deploy privados não foram encontrados/verificados. Origin ausente é aceito nos endpoints auth; não equivale a controle completo de cliente.

**Privacidade:** conta armazena nome/e-mail; perguntas e trechos vão ao provedor de linguagem escolhido. Portanto o texto “Nenhum dado pessoal é coletado” em Sobre está incorreto. Logs de guardrails registram rótulos sem pergunta, mas logs gerais de exceção podem incluir detalhes internos: não há política geral de retenção/redação comprovada.

Não houve varredura do histórico Git ou consulta a serviço de vulnerabilidades; ausência de segredo exposto nesta análise não certifica o histórico nem dependências. Nenhuma alegação de exploração realizada.

## 12. Masters

Frontend `components/Masters.tsx` define três perfis fixos com IDs FIDE e import de PNG: Hans `2093596`, Magnus `1503014`, Judit `700070`. Nome, biografia e curiosidade são hardcoded; nenhuma API atualiza biografias/imagens. “2882” na biografia de Magnus é valor histórico no texto, separado do rating dinâmico.

API `backend/masters.py` faz três GETs sequenciais para `https://ratings.fide.com/profile/{id}` com httpx, timeout 10 s, redirects e User-Agent específico. HTMLParser descarta scripts/styles; parser exige labels FIDE ID, STANDARD, World Rank e Active players, valida identidade/rating/rank e detecta inactive. Inativo mostra rating e estado, sem rank ativo. Isso é coleta de HTML de fonte oficial, **não API JSON pública documentada**.

Cache SQLite singleton tem attempted e payload. BEGIN IMMEDIATE serializa refresh entre threads/workers; intervalo 24 h desde tentativa, inclusive falha. Sucesso salva updated_at e três jogadores; falha preserva snapshot e data, marcando stale. Sem snapshot, retorna lista vazia/stale; frontend diz rating/dados indisponíveis, sem números inventados. Não existe job diário: atualização é preguiçosa quando alguém chama GET e TTL expirou.

Inspeção local encontrou cache com três jogadores, stale=false e updated_at em 05/10/2026. Isso comprova snapshot salvo, não uma coleta efetuada nesta auditoria nem a correção atual do HTML remoto. Timeout de request frontend é 35 s até headers; em refresh concorrente, três requisições/lock podem alongar atendimento.

Estilos `Masters.css`: Inter no texto, Pixelify nos títulos, cores individuais, cartões flex, hover/focus e grid de 3/2/1 colunas; movimento reduzido remove transições. Imagens de 0.64–1.23 MB são locais. Nenhum lazy loading em `<img>` encontrado; conteúdo monta mesmo quando a seção está oculta, embora fetch ratings aguarde visible.

## 13. Curiosidades

Carrossel ativo em `components/CuriositiesCard.tsx` com CSS próprio. Quatro PNGs em `public/images/curiosidades`: Leela Chess Zero, Transformers, Judit Polgár e Hans Niemann. Texto informativo pertence às imagens; alt resume apenas o tema. Não há busca de notícias, endpoint, LLM ou atualização externa dessas curiosidades.

`SLIDE_DURATION=10000`, timeout por slide, estado previous/index para transição horizontal 400 ms. Hover/foco pausam e preservam milissegundos restantes por ref. Tabindex=0 torna cartão focável; aria-hidden controla slides inativos; CSS respeita prefers-reduced-motion para animação, mas a troca automática de imagens continua.

Cada imagem tem cerca de 1.43–1.51 MB, todas montadas juntas. Não há botões próximo/anterior/pausar persistente; pausas dependem de foco/hover. Texto embutido em imagem reduz acessibilidade/pesquisa; não foi transcrito e validado nesta auditoria. Como arena permanece montada/hidden em outras áreas, temporizador não se condiciona à página ativa.

`src/curiosidades.ts` contém 20 fatos textuais fixos de regras; nenhum import foi localizado. Página `#/curiosidades` e modal homônimo mostram placeholder; carrossel não abre esse modal. Não confundir as três implementações.

## 14. Tutor, lições e exercícios

### Tutor

Pergunta/indicação documental em Chat, com anexação opcional do FEN da partida, limite 500, estado ocupado compartilhado pelo App e fontes/CTAs por resposta. Backend roteia cada pergunta independentemente; sem histórico conversacional, memória por usuário, streaming ou correção aberta de respostas do aluno. Fonte/trecho é controlada pelo código. Resultado de erro legado é exibido como mensagem no tutor.

### Lições

`agents/licoes.py` contém currículo fixo de 12 itens: movimentos, roque, en passant, xeque/mate/afogamento, notação, centro/desenvolvimento, dama cedo, garfo, cravada/espeto, ataque descoberto, mate rei/torre e oposição. Cada item tem pergunta e categoria. Não é conteúdo todo estático: respostas são geradas por agente com fontes e juiz, ou reutilizadas do cache.

`main.conteudo_da_licao` recupera cache e reaplica conceitos atuais, ou gera e grava só se houver fontes. `progresso.avancar` usa condição `proxima=entregue` para não pular duas lições concorrentes. Cache por número é global e não diferencia provedor/modelo/idioma/corpus. Reingestão pela API o limpa; mudança de modelo ou CLI ingest não o invalida automaticamente. Concorrência ainda pode gerar a mesma lição mais de uma vez, mesmo que avanço seja protegido.

UUID novo só surge ao pedir lição sem ID. localStorage salva ID com fallback em memória; frontend retoma última lição. `concluido` indica percurso entregue, não aprendizado aferido. Associações de prática são curadas em conceitos.py; poucas lições têm exercícios ligados. Não existe seleção livre de qualquer lição, pontuação, pré-requisito de domínio ou dashboard amplo.

### Exercícios

| ID | Objetivo real | Validação / limite |
| --- | --- | --- |
| `a1-cavalo` | Mover cavalo b1 a casa legal | Diagnóstico de peça/origem/ocupação/geometria/rei; um movimento |
| `a2-roque-pequeno` | Responder se roque curto é legal | Bool estrito; facts de direitos/torre/caminho/ataques |
| `a2-roque-grande` | Responder se roque longo é legal | Mesmo validador com percurso da ala da dama |
| `a2-roque-bloqueado` | Reconhecer roque impossível na inicial | Resposta NÃO; facts podem existir mesmo quando resposta correta |
| `a3-garfo-cavalo` | Garfo b5 e conversão com ganho líquido ≥3 | Até dois lances aluno/quatro plies; defesa canônica; partial/correct |
| `e1-material-seguro` | Evitar perda material no horizonte | Enumeração minimax em três plies, prioridade mate/material; um lance real |

A3 exige sucesso contra todas as primeiras respostas legais, segue identidade dos alvos deslocados e calcula ganho líquido após última defesa. Escolha de defesa prioriza refutação antes de material, com desempate UCI lexicográfico; não é engine geral nem minimax apenas material. Replay do histórico é validado a partir do catálogo; cliente não escolhe defesa. Não comprova origem de emissão anterior, apenas validade da sequência canônica.

E1 enumera lances legais no horizonte incluindo respostas quietas. Captura/perda/mate hipotéticos ficam em facts, sem mover a posição autoritativa quando incorreto. `correct` comprova somente segurança limitada à posição/horizonte, sem garantia de jogo futuro. Peças/material têm valores fixos P=1/N=B=3/R=5/Q=9.

Dicas em `hints.py` são curadas, três níveis conceptual/piece_or_region/specific_squares. Servidor reconstrói contexto e pode recalcular candidatos aceitos; nenhum texto é gerado por LLM. `next_hint` existe no contrato ValidationResult, mas validação atual não o popula: dicas vêm de rota própria.

Frontend preserva FEN/history autoritativos, aceita tentativa ilegal para feedback, separa falha operacional de resposta incorreta, bloqueia movimentos em perguntas SIM/NÃO e ignora respostas atrasadas após fechar/trocar exercício. Progresso é opcional: sem UUID anterior, não gera um ao abrir prática e não grava tentativa. Não há catálogo navegável, gerador de posições/exercícios, parametrização do horizonte pelo cliente ou import de puzzles externos.

## 15. Comentários e likes

`CommentLike.tsx` é interface ativa com textarea, botão Like (aria-pressed) e envio habilitado com texto não vazio. Estado é useState. Enviar mostra explicitamente: comentário não publicado nem salvo no servidor. Não há contagem compartilhada, autor, histórico, endpoint, banco ou localStorage.

ContentModal mantém filhos montados ao ocultar, então valores podem sobreviver a fechar/reabrir no mesmo App; reload/logout/remontagem os perde. Isso é memória de interface, não persistência. Cadastro público e comentários não devem ser documentados como serviços completos.

## 16. Integrações externas

| Serviço | Finalidade | Arquivo | Dados obtidos/enviados | Atualização | Fallback |
| --- | --- | --- | --- | --- | --- |
| Anthropic | Classificador, redação, juiz | `backend/llm.py`, router/base/analista/guardrails | Perguntas/trechos/fatos enviados, JSON gerado recebido | Sob demanda | Erros SDK/timeout → indisponibilidade/explicação ausente conforme camada; sem chave pode escapar |
| OpenAI | Provedor alternativo de linguagem | `backend/llm.py` | Mesmo pipeline | Sob demanda | Não troca automaticamente para outro provedor |
| Ollama | Modelo de linguagem local | `backend/llm.py` | Mesmo pipeline; endpoint padrão do SDK | Sob demanda | Sem fallback interprovedor; precisa modelo/serviço local |
| Sentence Transformers / Hugging Face | Modelo e5 e embeddings locais | `backend/ingest.py` | Pesos do modelo no primeiro carregamento; vetores locais | Ingestão/consulta/aquecimento | Cache local; sem fallback geral em falha de modelo |
| Stockfish local | Avaliar FEN/PV | `backend/agents/analista.py` | FEN enviado via UCI; score/mate/PV | Análise sob demanda | Mensagem motor ausente/falhou; finalização garantida no bloco de engine |
| FIDE ratings | Rating clássico, rank e ativo/inativo | `backend/masters.py` | HTML de três perfis | GET após 24 h da última tentativa | Snapshot stale ou vazio, sem rating hardcoded de emergência |
| FIDE Handbook | Referência legal e origem do PDF | `regras_curadas.py`, config, README histórico | Resumos fixos + PDF instalado manualmente | Sem refresh automático | Resumos básicos disponíveis sem índice; arquivo ausente não abre |
| Project Gutenberg | Capablanca/Staunton | config/ingest e README | TXT manual local | Reingestão manual | Pipeline procura outro índice ou erro; não baixa TXT |
| Exeter Chess Club | Curso Regis | config/ingest e README | PDF manual local | Reingestão manual | Outro índice para explicação; não baixa PDF |

Inter/Pixelify/Press Start são assets/fontes empacotados, não serviços de fonte remotos em runtime. Não foram encontradas APIs chess.com/Lichess, Google/Firebase/Supabase, serviço de analytics, pagamento, email ou integração com AlphaZero/Leela. Isso é conclusão do inventário de imports/HTTP do código atual, não da intenção de evolução.

## 17. Persistência

| Dado | Local / modelo | Duração e limites |
| --- | --- | --- |
| Posição e histórico da partida | App.useState, array FEN | Sessão da montagem; perdido em reload/logout; nenhuma tabela de partida |
| Chat, análises e demo | App.useState | Memória; backend não guarda conversa |
| FEN/history da prática | useExercise/reducer | Sessão local de exercício; reconstruído pelo servidor a cada validação |
| Usuário autenticado | AuthContext | Memória, restaurada por servidor |
| Sessão | Cookie HttpOnly `/auth` + tabela sessions em auth.sqlite | Sete dias; banco guarda hash do token |
| Usuários/credenciais | users em auth.sqlite | Nome/e-mail, salt, password_hash; senha original não armazenada |
| Identificador pedagógico | localStorage `xadrez-agente:usuario_id`, fallback memória | Independente da conta; não usa sessionStorage |
| Última lição/próxima | progresso em progresso.sqlite | UUID anônimo, número e timestamp |
| Conteúdo de lição | licoes_cache(numero, conteudo_json) | Global entre usuários, invalidado pela reingestão API |
| Exercícios concluídos/tentativas | progresso_exercicios no mesmo SQLite | UPSERT por UUID/exercise_id; conclusão monotônica; reenvio conta novamente |
| Catálogo/conceitos/dicas/demos | Código Python/TS | Fixos, versionados no Git |
| Documentos originais | backend/docs, ignorados | Arquivos locais; clone não contém livros |
| Vetores/metadados | backend/chroma | Disco, coleções recriadas na ingestão |
| Modelo embeddings | Cache da biblioteca + lru_cache | Cache externo/local e objeto em memória; não distribuído no Git |
| Ratings | masters-ratings.sqlite, cache singleton | Snapshot/datas/TTL, última tentativa incluindo falha |
| Biografias/curiosidades/imagens | Arrays e assets locais | Hardcoded; sem atualização de conteúdo |
| Comentários/likes | useState | Sem servidor/arquivo/localStorage |
| Guardrails | logs/guardrails.jsonl | Log local de rótulos; sem rotação configurada |
| Rate limits/ingerindo | Memória por processo | Reinício perde estado; workers não compartilham Event/contadores |

Arquivos auth.sqlite, progresso.sqlite, masters-ratings.sqlite e Chroma foram encontrados nesta máquina; existência não implica dados distribuídos. Não foi lido conteúdo de credenciais/sessões. Backup, migração e restauração desses bancos não estão implementados em scripts encontrados.

## 18. Assets e design

- Peças/avatares: `src/pixel/sprites.ts` guarda grades ASCII e paletas; Sprite transforma em SVG com retângulos. PecaSprite/pecas integra 12 tipos/lados ao react-chessboard; rotulos fornece nomes portugueses.
- Tabuleiro atual: `Board.tsx` usa `--board-light/--board-dark`, sem textura de tiles. `pixel/tiles.ts` e prévias antigas mostram grama/pedra; script `scripts/previa.ts` ainda gera esse visual antigo.
- Ícones de fontes/agentes: `pixel/icones.ts`, Sprite. Atalhos/login/Masters usam PNG, não grades SVG.
- Logo público PNG e JPEG original, foto pública de Judit e ilustração de login opaca/transparente. Versão opaca/foto/JPEG original não têm consumidor localizado no produto atual; são possíveis referências/legado, não arquivos inúteis comprovados.
- Fontes locais: cinco TTFs (~1.08 MB total) Inter 400/500/600, Pixelify Sans 600/700; OFL em arquivos próprios. Press Start 2P permanece importada em main e adiciona vários formatos/subsets ao build, embora Pixelify seja primeira opção para títulos.
- `index.css` tem 775 linhas: Tailwind import/@theme, tokens com aliases antigos, estilos sucessivos de arena/header/modais/layout/login e regras responsivas. Há sobreposições de fases anteriores e seletores aparentemente órfãos; não foi executado coverage CSS em navegador.
- Sistema visual atual: fundo creme, azul Magnus, laranja Hans, peças em pixel art, tipografia Pixelify/Inter, cards, tooltips, modais e sombras/bordas. `Masters.css` e `CuriositiesCard.css` isolam galerias/transições.
- Responsividade principal atual usa breakpoint 899/900 em useMatchLayout; CSS também mantém 480/600/1023/1279/1600 de etapas anteriores. Medição com ResizeObserver compensa chrome da arena.
- Acessibilidade: semantic buttons, labels, aria-live, conteúdo `inert` com modal, trap de foco, Escape/restauração, movimento reduzido e tradução de drag via MutationObserver. Tradução depende de strings/DOM de biblioteca; atualização de react-chessboard pode quebrá-la.

### Peso observado

Assets ativos importados no build: ilustração login 0.435 MB; botões login/cadastro 0.775/0.811 MB; tutor 0.923 MB; lições 1.304 MB; perfis Masters 0.637/1.122/1.227 MB. Quatro PNGs do carrossel totalizam ~5.86 MB e logo ~0.898 MB. Todos os arquivos públicos vão ao dist; não há lazy load declarado para imagens da galeria/carrossel, nem code splitting das áreas de App. O JS final foi 415.50 kB (129.25 kB gzip), CSS 84.39 kB (25.48 kB gzip). Impacto de rede real não foi medido.

`frontend/qa-visual/` reúne capturas PNG, métricas JSON, scripts de inspeção via Chrome/CDP e patch histórico. São evidências de versões anteriores, não testes executados nesta auditoria nem recursos usados pelo site. Prévia `frontend/previa/` também é histórica. Autoria/licença específica de cada PNG não foi possível confirmar apenas pelo código; documentos antigos atribuem sprites ao projeto, o que não certifica todos os assets posteriores.

## 19. Testes

### Resultado atual executado

| Verificação | Resultado / limite |
| --- | --- |
| `cd frontend && npm test` | **190 passaram, 1 falhou; 191 testes em 31 arquivos**; 30 arquivos verdes, 1 com falha; ~39.62 s |
| `npm test -- src/match/MatchArena.test.tsx` | **15 passaram, 1 falhou**, mesmo teste, ~1.49 s |
| `cd frontend && npm run build` | **Aprovado**, TypeScript noEmit + produção Vite; versões locais Node 24.16.0/npm 11.13.0 |
| `cd backend && PYTHONDONTWRITEBYTECODE=1 python3.11 -m pytest -p no:cacheprovider` | Não iniciou: **No module named pytest** no Python 3.11 disponível |
| `/usr/bin/python3 -m pytest -p no:cacheprovider -m 'not llm and not modelo_real'` | Falhou no carregamento de conftest: Python 3.9 não suporta avaliação `str \| None` em ingest.py:224; nenhum teste executado |
| ast.parse de todos os módulos backend | Aprovado; verifica sintaxe, não imports/execução ou tipagem |
| LLM real, FIDE real, ingestão e browser integrado | Não executados; operação completa não foi possível confirmar |

A suíte completa falhou em `match/MatchArena.test.tsx:189`, verificando ocultação da arena após navegação. O rerun isolado avançou até linha 191: busca exata por diálogo “SOBRE O PROJETO” encontra diálogo nomeado “SOBRE O PROJETO:”. A evidência isolada comprova expectativa desatualizada de nome acessível; a causa precisa da primeira falha de sincronização não foi possível confirmar. Não se deve concluir, só por isso, que a navegação real em browser está quebrada.

### Backend: inventário por conjunto

Base `backend/tests/`; comandos executáveis no ambiente correto: `python -m pytest tests/NOME.py`, ou suíte offline `python -m pytest -m 'not llm and not modelo_real'`. `pytest.ini` usa testpaths tests/eval e default `not llm`; um teste de modelo real não é excluído pelo default.

| Arquivo | Cobertura principal |
| --- | --- |
| `test_api.py` | Health/CORS/rate limit, chat/análise, erros/timeout/ingestão, lições/cache/UUID |
| `test_auth.py` | Senha/sessão/logout, expiração/forja, rate limit, origem e cadastro inexistente |
| `test_masters.py` | Parse ativo/inativo, markup inválido, TTL, falha/snapshot, cache concurrente e endpoint |
| `test_backend_v1.py` | Referências sem embeddings, cache legado, associações, análise/prática/progresso/concorrência |
| `test_exercises_models.py` | Unions/contratos/valores estritos/invariantes/FEN/history/facts |
| `test_exercises_validation.py` | A1/A2/A3/E1, legalidade, ganho/defesa/refutação, estados autoritativos e histórico |
| `test_exercises_api.py` | GET/validate/hint, protocolo/status HTTP, versão, router isolado e callbacks |
| `test_exercises_hints.py` | Dicas 1–3, contexto A1/A2/A3/E1 e entradas inválidas |
| `test_agentes.py` | Prompts/fontes/IDs/fallback de formato, fábrica LLM; inclui teste marcado llm |
| `test_router.py` | Classificação/overrides, FEN, fallback entre índices e recusas |
| `test_guardrails.py` | Injeção, falsas recusas, juiz, confiança/saída, validação FEN/lances/log |
| `test_analista.py` | Stockfish, avaliação, PV, fechamento do processo, explicação/erros/juiz |
| `test_demonstracoes.py` | Legalidade das demos, reconhecimento de temas e PV para replay |
| `test_documentos.py` | PDF/TXT, path traversal/symlinks/allowlist, chunk/contexto e 404 |
| `test_ingest.py` | Limpeza, fragmentação, diagramas, seção/local e filtro de listas de lances |
| `test_retrieval.py` | Glossário/índice inválido e buscas em corpus; partes pulam se coleções ausentes |
| `test_recomendar.py` | Busca/recomendações, ausência de agente, recusas e rota |
| `test_onde_ler.py` | Ordem/margem/deduplicação/frases/fontes/juiz; inclui caso modelo_real |
| `test_concorrencia.py` | Embeddings em subprocesso/threads sem derrubar processo |

Fixtures de main substituem LLMs por dependências falsas, bancos temporários e aquecimento. conftest desliga juiz real em testes não llm, limpa chave Anthropic e substitui semelhança de frases por palavras exceto marcador modelo_real. Não há prova geral de todas as combinações de configuração/provedor só por esses fixtures.

Base `backend/eval/`: `test_roteamento.py` (classificação real e ponta a ponta), `test_analista_llm.py` (engine + explicação real), `test_guardrails_llm.py` (injeção/juiz reais), todos llm. `avaliar_roteamento.py`, `avaliar_guardrails.py`, `comparar_embeddings.py` são scripts de avaliação manual; examinam conjuntos pequenos fixos, não CI contínua. Comandos `python eval/avaliar_roteamento.py` etc. conforme PYTHONPATH/ambiente do projeto; custos/downloads podem existir. Não foram reexecutados.

### Frontend: todos os 31 arquivos de testes

| Grupo / arquivos em `frontend/src/` | O que verificam |
| --- | --- |
| `App.test.tsx`, `App.exercises.test.tsx`, `App.modals.test.tsx`, `ExperienciaPedagogica.test.tsx` | Orquestração, modos demo/prática/partida, lição, modal, preservação e fluxos com API simulada |
| `match/MatchArena.test.tsx` | Turno, histórico, análise, pausa, navegação e logout; contém falha atual |
| `auth/AuthGate.test.tsx`, `auth/AuthGate.integration.test.tsx` | Login/session/erros/cadastro negado/logout, gate e menu real |
| `api.test.ts`, `exercises/api.test.ts` | Transporte, timeout/erros, payloads, UUID e contrato de exercícios |
| `exercises/useExercise.test.ts`, `exercises/pedagogia.test.ts`, `exercises/visual.test.ts` | Reducer/hook/concurrency, feedback, facts e visual/refutação |
| `components/Board.test.tsx`, `Board.layout.test.tsx` | Input normal/ilegal para prática, bloqueios/modos/contexto |
| `components/ContentModal.test.tsx`, `InteractiveCard.test.tsx` | Escape, foco, scroll/tooltip/card |
| `components/Header.test.tsx`, `Sobre.tooltip.test.tsx` | Links/branding e tooltip de fontes |
| `components/Masters.test.tsx`, `CuriositiesCard.test.tsx` | Dados/fallback de ratings, imagens, carrossel/pausas/movimento |
| `components/Mensagem.test.tsx`, `OndeLer.test.tsx` | Texto/confiança/fontes/links de documentos |
| `components/ExercisePanel.test.tsx`, `RelatedPractice.test.tsx` | Feedback, ações/dicas/progresso/CTAs |
| `components/Reprodutor.test.tsx`, `Carregando.test.tsx` | Controles de replay e mensagens temporais |
| `armazenamento.test.ts`, `demonstracao.test.ts`, `lances.test.ts`, `idioma.test.tsx`, `pixel/pecas.test.tsx` | UUID/fallback, SAN, legalidade, tradução e integridade/rótulos SVG |

`vite.config.ts` usa jsdom, setup `src/testes/configuracao.ts`, maxWorkers=2. Não usa layout real de navegador; mocks de matchMedia/ResizeObserver e fixtures HTTP não medem rede, engine/LLM remoto ou responsividade real. Scripts QA via Chrome não estão no `npm test` e usam evidências históricas.

### Áreas sem confirmação/cobertura suficiente

Integração real cookie/CORS/TLS + provedores, autorização das rotas (ausente), expiração em UI aberta, corpus e relevância atuais, qualidade/custos dos modelos, repetição tripla/underpromotion, cache de lições após troca de modelo/CLI ingest, reingestão multiworker, performance de hints enumerativas, erro/body HTTP malformado em respostas 2xx, deployment em subpath/fontes e acessibilidade de texto em imagens.

Números antigos do README (309 offline/60 API/57 frontend), BACKEND_V1 (598/4 pulados/61 não selecionados) e arquivos de QA (93/109/114/141/147 etc.) são registros históricos, não contagens reproduzidas hoje. Métricas antigas hit@4/MRR/roteamento e latências 7–17 s não foram confirmadas e não são benchmarks atuais.

Para preservar informação útil do README anterior, estes são os resultados que ele registrava, **sem revalidação atual**:

| Avaliação histórica | Resultado registrado | Script/conjunto |
| --- | --- | --- |
| Busca entre os quatro primeiros | 17/22; MRR 0,68; comparação antiga MiniLM 9/18 | `eval/comparar_embeddings.py` |
| Roteamento | Haiku 24–26/26, 32/32 incluindo tabuleiro; Opus 25/25 | `eval/avaliar_roteamento.py`, amostras/rodadas diferentes |
| Injeção | 8/8 barradas; quatro padrões, quatro classificador | `eval/avaliar_guardrails.py` |
| Falsos positivos | 0/5 perguntas legítimas | Mesmo script |
| Juiz | 8/8 pares rotulados, incluindo dois com fatos da engine | Mesmo script |
| Tempo típico declarado | Pergunta 7–10 s; análise 12–17 s | Observação histórica sem benchmark reproduzido |

Esses números representam amostras pequenas e não comprovam robustez, qualidade do corpus/modelo atual ou latência em outro ambiente.

## 20. Dependências

### Frontend

Versões resolvidas no lockfile/instalação local, não consulta ao npm remoto.

| Dependência | Versão no lock / uso |
| --- | --- |
| react / react-dom | 19.3.0; componentes/hooks, Context, createRoot e portais |
| chess.js | 1.4.0; legalidade/FEN/SAN/replay/histórico |
| react-chessboard | 5.12.1; desenho e interação do tabuleiro |
| @fontsource/press-start-2p | Declarada ^5.3.0; import ativo em main, alternativa tipográfica |
| vite / @vitejs/plugin-react | Vite 8.3.1; dev/build e plugin React |
| typescript / @types react/dom/node | TS 7.0.2; noEmit strict e contratos |
| tailwindcss / @tailwindcss/vite | 4.3.3; utilities/theme e build CSS |
| vitest | 5.0.3; executor de testes |
| @testing-library/react / dom | Renderização/query/eventos; DOM é também dependência do conjunto de testes |
| jsdom | DOM de testes, sem layout real |

Não foi encontrada dependência frontend claramente sem import/uso de build/teste. Press Start é ativa, mas potencialmente redundante com Pixelify. `@testing-library/dom` pode servir transitivamente/peer, portanto não deve ser classificada como morta só por falta de import direto. `frontend/package-lock.json` é o lock real; `package-lock.json` da raiz tem `packages={}`, sem package.json correspondente e sem utilidade para instalar o frontend.

### Backend

`requirements.txt` declara mínimos com `>=`, sem pins exatos ou lock: FastAPI ≥0.115, uvicorn ≥0.30, Pydantic ≥2.7, pydantic-settings ≥2.3, slowapi ≥0.1.9, LangGraph ≥0.2, LangChain ≥0.3, adapters OpenAI/Anthropic/Ollama, Chroma ≥0.5, Sentence Transformers ≥3.0, pypdf ≥4.2, python-chess ≥1.10, pytest ≥8.2 e httpx ≥0.27.

| Grupo | Uso real |
| --- | --- |
| FastAPI/uvicorn/Pydantic/settings | Aplicação, servidor, validação e .env |
| slowapi | Limites por IP em rotas selecionadas |
| LangGraph | Grafo efetivamente construído em router.criar_grafo |
| langchain-core (transitivo) | Mensagens, modelos, schemas e fake LLMs de testes |
| langchain-openai/anthropic/ollama | Imports condicionais da fábrica; necessários apenas conforme provedor, mas todos declarados |
| `langchain` pacote agregado | Nenhum import direto encontrado; candidato a dependência redundante, condicionado a requisitos transitivos dos adapters |
| ChromaDB/Sentence Transformers | Persistência vetorial/embeddings e frase-chave |
| pypdf | Texto PDF na ingestão/contexto; sem OCR |
| python-chess | Legalidade, fatos pedagógicos, SAN e integração UCI |
| pytest | Testes/markers/fixtures |
| httpx | TestClient e **runtime Masters**; comentário da seção “Testes e avaliação” em requirements não representa todo uso |
| sqlite3/hashlib/secrets/html.parser/threading | Biblioteca padrão, não pacotes a instalar |

RAGAS está comentado como removido, não instalado nem importado por código de avaliação. Sem manifesto Python de versão, módulos usam anotações que exigem Python ≥3.10; caminho documentado Python 3.11 é apropriado, mas compatibilidade exata das dependências deve ser validada nesse ambiente. Não foi feita auditoria CVE/licença transitive completa.

## 21. Código morto ou legado

Achados conservadores, sem remoção. “Sem chamada localizada” não equivale a prova formal de código morto; scripts/testes e compatibilidade também contam como uso.

| Candidato | Evidência / classificação |
| --- | --- |
| `components/Avatar.tsx` | Export sem import localizado; personagem atual usa PixelAvatar |
| `match/MatchArena.tsx:Sidebar` | Export não montado por App; navegação vertical antiga |
| `src/curiosidades.ts` | 20 fatos, sem import; não alimenta carrossel/página |
| `HeaderNavigation.preferences` | Estado inicial false e setters apenas false; seção de configurações inacessível |
| Props onLessons/onCuriosities do HeaderNavigation | Declaradas, não consumidas pela função atual |
| `agents/demonstracoes.py:para_pergunta` | Sem chamada localizada; router chama tema_da_pergunta e consulta DEMONSTRACOES diretamente |
| Wrappers arbitro/professor/estrategista.responder | Usados em testes e CLI via lookup; API passa diretamente pelo fluxo genérico; não remover como mortos |
| router.classificar_pergunta | Usado por eval; não é caminho HTTP principal |
| `pixel/tiles.ts` | GRADES_DOS_TILES ativo no script previa; TILE_GRAMA/TILE_PEDRA/fundoDoTile sem consumidor do Board atual |
| `sprites.ts:svgDaGrade` | Consumidor do produto não localizado; renderização atual usa Sprite; candidato auxiliar legado |
| `.player`, `.arena-sidebar`, `.brand-avatar`, `.arena-board-row`, `.arena-position-info` e derivados no CSS | Algumas classes sem markup atual/import correspondente; outros estilos sobrepostos por fases posteriores; confirmação final exigiria coverage visual |
| `src/assets/auth-illustration.png`, `public/images/judit-polgar.jpeg`, logo JPEG original | Variantes/referências não importadas pelo produto atual |
| `frontend/previa/` | Render histórico com tiles, não aparência atual da arena |
| `frontend/qa-visual/ascii-final/alteracoes.patch` | Patch arquivado, não aplicado automaticamente; não tratar como código atual |
| `package-lock.json` raiz | Lock vazio, sem projeto Node raiz; frontend tem lock próprio |
| Modal/página de curiosidades | Ramo placeholder separado do carrossel ativo; gatilho modal não localizado |

Não foram encontrados TODO/FIXME de implementação em runtime que definam funcionalidades adicionais. `PROMPTS.md` tem TODO planejado de respostas de referência para golden set, e requirements comenta RAGAS/Fase 8. Palavras “placeholder” em inputs são textos de ajuda, não prova de recurso falso. Mocks estão principalmente em testes/fixtures; não há servidor fake da API em produção. Dados curados/hardcoded são descritos nas seções anteriores e nem todos constituem dívida.

Duplicações: SAN inglês→português existe em backend analista e frontend demonstracao; nomes de conceitos/exercícios e tipos são espelhados em Python/TS; lista de documentos de Sobre tem quatro entradas enquanto config tem cinco. CSS conserva sucessivas regras para os mesmos seletores. São fontes de divergência, não motivo para refatorar sem definir contrato.

### Divergências documentais registradas

| Fonte antiga/interface | Contradição com estado encontrado |
| --- | --- |
| README anterior: “Lições sem exercícios” | CTAs e seis exercícios ativos existem |
| README anterior: contagem 57 frontend/309 backend | Frontend atual tem 191 testes; backend atual não reexecutado |
| README/REDESIGN/CLAUDE: fonte principal Press Start/texto do sistema | Pixelify e Inter locais são atuais; Press Start permanece fallback/import |
| BACKEND_V1: docs vazio/índices não ingeridos | Cópia atual tem quatro documentos e três coleções/775 trechos |
| BACKEND_V1: login/frontend adiados | AuthGate e auth.py implementados posteriormente |
| EXERCISES_V1: layout tutor lateral e UI de etapa 1 | App atual usa modais, página de lições e arena reorganizada; etapa 1 é histórico |
| PROMPTS/CLAUDE: RAGAS/golden set/relatório planejado | Sem RAGAS ativo, golden set de 40 ou eval/resultado.md encontrados |
| Sobre: agentes Magnus/Hans jogam entre si | Nenhum pipeline de jogo autônomo localizado |
| Sobre: nenhum dado pessoal coletado | Nome/e-mail de conta e comunicação de perguntas ao provedor |
| Sobre/README antigo: quatro documentos completos | Config inclui Lasker opcional; disponibilidade local varia |
| Guardrails antigos: todo lance do LLM validado | Validação cobre listas declaradas e contextos específicos; não extrai todo SAN de todo texto |

Esses arquivos/interface foram preservados pela regra de alterar somente README e PROJECT_AUDIT. São referências históricas e pendências para futura correção autorizada.

## 22. Problemas técnicos encontrados

Classificação considera impacto se o projeto for exposto/expandido, distinguindo problema demonstrado de hipótese condicionada. Não foi comprovada vulnerabilidade crítica explorável nesta sessão; por isso não se atribui CRÍTICO sem evidência. Falta de autorização é ALTO no uso privado/público com recursos pagos.

### CRÍTICO

Nenhum achado classificado CRÍTICO com evidência suficiente. Isso não certifica segurança para publicação.

### ALTO

| ID | Problema / evidência | Consequência e grau de confirmação |
| --- | --- | --- |
| A1 | API pedagógica sem sessão: `backend/main.py:244` e demais rotas; `exercises/api.py:103`; cookie em `auth.py:70` | Chamadas/custos e progresso disponíveis fora do login; ausência comprovada no código |
| A2 | Stockfish acoplado à disponibilidade de LLM/RAG: `analista.py:364–382,479`, `main.py:analisar_fen` | Sem chave/índice, fatos já calculados podem se perder em erro geral; confirmado pelo caminho estático, não por chamada real |
| A3 | Busca enumerativa sem rate limit/timeout da aplicação: `exercises/api.py:103–125`, `validation.py`, `hints.py` | CPU/threadpool suscetíveis a repetição de validate/hint; código confirma ausência, carga adversarial não testada |
| A4 | Aquecimento obrigatório por padrão: `main.py:139–144`, `config.py` | Falha de modelo/download impede auth/prática/API independente; risco condicionado ao ambiente |

### MÉDIO

| ID | Problema / arquivo/região | Impacto / confirmação |
| --- | --- | --- |
| M1 | Suíte vermelha: `MatchArena.test.tsx:189–191`, `App.tsx`/ContentModal | 1 falha em execução completa e isolada; nome com dois-pontos diverge da expectativa; primeira falha temporal sem causa final confirmada |
| M2 | Histórico de legalidade descartado: `lances.ts:9–18,29–40` | Repetição tripla não detectável pelo FEN isolado; não há teste atual cobrindo isso |
| M3 | Contexto/status em host hidden: `App.tsx:294`, `Board.tsx` context | Aviso textual de xeque/mate/empate inacessível na arena; markup comprovado |
| M4 | Descrição funcional/privacidade incorreta: `Sobre.tsx:21,25,40–42` | Usuário pode acreditar em dois bots e ausência de dados pessoais |
| M5 | Timeout não cancela trabalho: `main.py:114–125` | Threads/custo podem continuar após 504; limitação documentada no próprio código |
| M6 | Ingestão destrutiva sem troca atômica: `ingest.py:273–299`, `main.py:410–434` | Falhas/concorrência deixam corpus parcial; Event apenas por processo; não testado em multiworker |
| M7 | Cache de lições pouco versionado: `progresso.py`, `main.py:305` | Troca de modelo/corpus por CLI não invalida conteúdo; geração concorrente pode duplicar custo |
| M8 | Progresso anônimo não vinculado à conta: `armazenamento.ts`, `api.ts`, `progresso.py` | Compartilhamento de navegador mistura percurso; detentor de UUID pode mutar; POST sem idempotência |
| M9 | Assets pesados/sem lazy load: App/Masters/CuriositiesCard e PNGs | Custo de rede e memória, especialmente mobile; bytes observados, impacto real não medido |
| M10 | Parsing de análise por texto: `MatchArena.tsx:AgentThinking` | Mudança de rótulos/formato perde cards de melhor lance/avaliação; sem contrato numérico próprio |
| M11 | Dependências Python sem lock/ambiente reproduzível: requirements | Não foi possível executar testes no Python alvo; futuros installs podem divergir |
| M12 | Checagem limitada de lances gerados: `analista.py:309–317` | Aceita legal fora da PV e depende de autodeclaração dos lances; garantia de documentação excessiva |

### BAIXO

| ID | Problema / evidência | Efeito |
| --- | --- | --- |
| B1 | Hashes partida/sobre sem contrato comum, fallback genérico: `App.tsx:46,257`, HeaderNavigation | aria-current incorreto após login/rotas desconhecidas aceitas |
| B2 | Preferências inacessíveis e props sem uso: HeaderNavigation | UI legada/testes/documentos podem anunciar configuração que não abre |
| B3 | Fontes absolutas `/fonts/`: index.css:3–7 | Subpath de hosting pode quebrar carregamento; deploy não testado |
| B4 | health só testa presença: main.py:220,health | “ok” não comprova modelo/chave funcional; provedor desconhecido pode reportar chave disponível |
| B5 | Timeout HTTP encerra no recebimento de headers: api.ts:64 | Corpo JSON lento não fica coberto pelo timer; sem validação de schema 2xx |
| B6 | Atualização Masters depende de HTML/GET: masters.py | Mudança do site produz stale por 24 h; não houve validação externa atual |
| B7 | Prévia/docs de layout desatualizadas, CSS acumulado | Dificulta leitura/manutenção, sem afetar necessariamente uso atual |
| B8 | Promotion=q e ausência de escolha: lances.ts | Subpromoção indisponível, diferença entre regras ensinadas e UI |
| B9 | Carrossel só imagens/pausa foco-hover | Conteúdo incompleto para leitores de tela e sem controle manual permanente |
| B10 | `connect()` auth usa context manager SQLite sem close explícito | Liberação depende do ciclo de vida do objeto; contrasta com contextlib.closing em progresso; vazamento persistente não foi medido |

**Cinco prioridades principais:** A1 (autorização), A2 (análise perder fatos em falha de dependência), A3 (limites dos exercícios), M1 (suíte atualmente vermelha) e M2 (histórico necessário para regras de empate). A4/M3/M4 também merecem correção cedo, conforme objetivo de operação e UX.

## 23. Funcionalidades incompletas

- Autenticação de entrada real, porém proteção da API ausente; expiração não acompanhada na UI e progresso não associado à conta.
- Formulário de cadastro existe, criação pública deliberadamente desativada e sem endpoint.
- Magnus/Hans com identidade visual, turnos, atividade e análises sob demanda; sem autonomia, política de jogadas por personagem ou bots.
- Histórico local de uma partida; sem biblioteca de partidas, persistência, PGN/import/export ou repetição reconstruída.
- Análise de uma posição, não partida inteira; explicação opcional em intenção, porém caminho de falha ainda acoplado a configuração/corpus.
- Progresso mede entrega/conclusão pontual, não competência; poucas lições possuem prática e não há catálogo acessível completo.
- Biblioteca configurada e RAG real, mas não foi confirmada relevância/atualização/autenticidade do corpus local; Lasker ausente; OCR não existe.
- Página/modal de curiosidades placeholders; carrossel separado implementado com imagens fixas.
- Comentários/like ativos como demonstração, sem serviço/persistência.
- Configurações no header com estado inacessível; sem preferências editáveis persistidas.
- Avaliação manual pequena, sem golden set amplo, RAGAS, CI/deploy verificados ou benchmark atual.

## 24. O que parece funcionar hoje

Legenda: `[x]` implementado com evidência local adequada; `[~]` parcialmente implementado; `[ ]` não implementado/apenas planejado; `[?]` implementação encontrada, mas operação completa não foi possível confirmar. As marcas `[~]`/`[?]` são texto de classificação, não checkbox padrão Markdown.

- [x] Build TypeScript/Vite do frontend.
- [x] Tabuleiro/controles/replay/fluxos pedagógicos cobertos pelos testes frontend aprovados.
- [x] Exibição de fontes, recomendações e exercícios a partir de respostas simuladas.
- [x] Carrossel com timer/pausa e modais/atalhos em testes.
- [x] Contratos/rotas de API, RAG e engine presentes no código.
- [~] Login real implementado/testado no frontend com mocks, API pedagógica sem autorização.
- [~] Histórico e regras da partida: só FENs em memória, sem repetição completa/subpromoção.
- [~] Navegação e suíte: um teste falhando; causa de sincronização inicial não confirmada.
- [~] Lições/prática/progresso: sistema curado limitado, UUID independente da sessão.
- [~] Magnus/Hans: nomes/painéis, sem jogadores autônomos.
- [~] Curiosidades: carrossel ativo, página/modal provisórios.
- [~] Comentários/likes: interface demonstrativa, sem armazenamento.
- [~] Documentação/Sobre da interface: funcional como modal, conteúdo parcialmente incorreto.
- [?] Login/sessão funcionando entre browser real e API neste ambiente.
- [?] LLM dos três provedores com modelos/opções atuais.
- [?] Stockfish + RAG + explicação ponta a ponta neste ambiente.
- [?] Relevância e correspondência atual dos 775 trechos locais.
- [?] Refresh remoto FIDE; snapshot local de três jogadores confirmado.
- [?] Suíte backend completa no Python apropriado.
- [ ] Cadastro público, backend de comentários/likes.
- [ ] Partida autônoma Magnus × Hans, partidas online multiplayer.
- [ ] Persistência/PGN de partidas e conversas.
- [ ] Integração executável AlphaZero/Leela.
- [ ] RAGAS/golden set amplo/relatório automático de avaliação prometido.
- [ ] Infraestrutura de publicação/billing/controle de gastos/CI localizada no repositório.

## 25. Mapa do projeto

```text
xadrez-agente-main/
  README.md                  Guia atualizado do que existe hoje
  PROJECT_AUDIT.md           Esta auditoria e plano técnico
  BACKEND_V1.md              Registro pedagógico V1, algumas afirmações temporais antigas
  CLAUDE.md                  Especificação/decisões de desenvolvimento
  PROMPTS.md                 Roteiro histórico; contém planos não implementados
  LICENSE                    GPL-3.0
  .env.example               Parte das configurações backend, sem secrets
  .gitignore                 Exclui secrets, dados locais, docs terceiros e build/cache
  package-lock.json          Lock Node raiz vazio, sem package.json correspondente
  backend/
    main.py                  App, lifespan, handlers e 10 endpoints próprios
    auth.py                  3 endpoints auth, scrypt, cookie e banco
    configure_owner.py       CLI local de credenciais
    masters.py               Endpoint ratings, parser FIDE, TTL/cache SQLite
    config.py                Settings, cinco documentos e três índices
    schemas.py               Contratos Resposta/lições/fontes/saúde
    conceitos.py             Associações fixas conteúdo → prática
    regras_curadas.py        Resumos FIDE para perguntas básicas
    ingest.py                Limpeza/chunks/embeddings/coleções
    retrieval.py             Glossário/busca/limiar/chunk
    onde_ler.py               Trechos e frase-chave por similaridade
    documentos.py            Allowlist de arquivos e contexto
    llm.py                   Fábrica dos três provedores/papéis
    guardrails.py            Entrada/juiz/saída/FEN/SAN/log
    progresso.py             SQLite de lições/cache/exercícios
    testar_agente.py          CLI de consulta aos agentes/roteador
    requirements.txt         Dependências com mínimos, sem lock Python
    pytest.ini / conftest.py  Marcadores/config/fixtures de log
    agents/
      base.py                Prompts estruturados/fontes comuns
      router.py              Grafo LangGraph e fallback
      arbitro.py             Config/papel regras
      professor.py           Config/papel fundamentos
      estrategista.py        Config/papel táticas
      analista.py            UCI/avaliação/PV/explicação/prática
      demonstracoes.py       14 posições/sequências curadas
      licoes.py              Currículo fixo de 12 perguntas
      __init__.py            Pacote
    exercises/
      models.py              Contratos discriminados e invariantes
      catalog.py             Seis exercícios versionados
      validation.py          Diagnósticos/roque/A3/E1 e replay
      hints.py               Três níveis de dicas curadas
      api.py                 GET/validate/hint e erros independentes
      __init__.py            Pacote
    tests/                   19 arquivos test_*.py, fixtures offline
    eval/                    3 suítes LLM e 3 scripts de avaliação
    docs/.gitkeep            Único arquivo do corpus rastreado
    docs/*                   Quatro documentos locais nesta cópia, ignorados
    chroma/                  Três coleções/775 trechos locais, ignorados
    auth.sqlite              Contas/sessões locais, ignorado
    progresso.sqlite         Progresso/cache local, ignorado
    masters-ratings.sqlite   Snapshot ratings local, ignorado
    logs/                    Guardrails, ignorados
  frontend/
    package.json             Scripts dev/build/preview/test/previa
    package-lock.json        Dependências frontend resolvidas
    .env.example             VITE_API_URL
    index.html               Entrada SPA
    vite.config.ts           React/Tailwind, porta 5173, Vitest/jsdom
    tsconfig.json            TypeScript strict/noUnused/noEmit
    EXERCISES_V1.md           Histórico de implantação de prática
    REDESIGN_V1.md            Histórico de visual anterior
    src/
      main.tsx               Fontes/CSS, AuthProvider/AuthGate
      App.tsx                Estado/orquestração da arena e áreas
      api.ts / types.ts      Transporte e contratos backend espelhados
      lances.ts              Chess.js, movimentos/status por FEN
      demonstracao.ts        Replay/SAN português
      armazenamento.ts       UUID anônimo localStorage/memória
      idioma.ts              Tradução/rótulos de saída e fontes
      acessibilidadeTabuleiro.ts  Tradução DOM do arraste
      curiosidades.ts        Lista textual não consumida atualmente
      index.css              Tokens/estilos globais e várias fases de layout
      auth/                  Context/gate/login/authApi e testes
      match/                 Turno/cards/histórico/controles/medição e testes
      components/            Inventário completo na seção 5 + testes
      exercises/             Hook/reducer/facts/feedback/refutação e testes
      pixel/                 Sprites/peças/ícones/tiles/rótulos e testes
      testes/                Setup de DOM e fixtures pedagógicas/HTTP
      assets/                Ilustrações/login/atalhos e masters/*.png
      *.test.ts[x]           Testes de funções/App/pedagogia
    public/
      fonts/                 Inter/Pixelify TTF e OFL
      images/                Logo, originais/referências, curiosidades PNG
    scripts/previa.ts         Gera PNG com visual antigo/tiles
    previa/                  PNGs históricos 32/40 px
    qa-visual/               Capturas/métricas/scripts/patch históricos
    node_modules/ / dist/    Dependências/build gerados, ignorados
```

`main.py` tem 10 endpoints próprios; somados auth(3), Masters(1), exercises(3), são **17 endpoints de produto/admin**, além das quatro rotas GET automáticas da documentação. Árvore não lista cada captura/teste individual: inventários específicos estão nas seções 5 e 19.

## 26. Recomendações

### Correções necessárias

Corrigir a expectativa do teste Sobre e investigar sincronização de hash com o teste completo; depois restabelecer suíte verde. Desacoplar apresentação dos fatos Stockfish da falta de chave/corpus, mantendo erros de explicação explícitos. Restaurar avisos de xeque/mate/empate e rever texto de Sobre/privacidade. Documentar ambiente Python reproduzível antes de interpretar resultados antigos como atuais.

### Melhorias de arquitetura

Definir contrato único de navegação; separar estado de partida, aprendizagem e áreas do App quando houver autorização para refatorar. Adicionar contrato estruturado para avaliação/PV em lugar de regex em texto. Versionar cache de lições por corpus/prompt/modelo e coordenar geração. Ingestão deve construir índices novos e trocar apenas após sucesso, com lock compartilhado quando houver múltiplos workers. Revisar dependências/lock, sem removê-las por inferência apenas.

### Melhorias de UX/UI

Mostrar claramente “partida manual” e “análise sob demanda”; ajustar rótulos de pausa/tempo de atividade. Remover promessa visual de cadastro ativo ou explicar seu bloqueio antes do envio. Criar acesso simples ao catálogo de exercícios, feedback de sessão expirada e indicação de qual FEN foi anexado. Curiosidades devem ter texto acessível e controles explícitos. Otimizar PNGs/lazy loading/fontes após medir carregamento e preservar direitos/autoria.

### Melhorias no sistema de xadrez

Manter instância/histórico completo de Chess ou reconstruir todos os lances para regras dependentes de repetição. Adicionar escolha de promoção e teste de finais/empates. Se desejado, implementar PGN/import/export e persistência de partidas como recursos separados. Antes de autonomia Magnus/Hans, definir força, política de jogadas, loop/cancelamento e significado pedagógico; isso ainda não existe.

### Melhorias de IA

Validar modelos/opções de cada provedor com smoke tests controlados. Tratar indisponibilidade de configuração/corpus como estado conhecido, com fatos determinísticos preservados. Explicitar que confiança não é probabilidade de acerto; extrair/verificar SAN do texto e limitar à PV quando esse for o contrato. Criar golden set revisado com respostas/fontes, avaliar RAG cross-lingual e custos/latência antes de mudar embeddings/threshold. RAGAS é possibilidade, não dependência necessária para exercícios determinísticos.

### Melhorias de segurança

Definir objetivo de acesso pessoal/público e exigir sessão/propriedade nas operações correspondentes. Harmonizar cookie/transporte de credenciais com esse objetivo. Vincular progresso a identidade quando necessário, preservando migração do UUID. Cobrir exercícios com limite de taxa/custo computacional e limites de concorrência de linguagem. Ajustar HTTPS/Secure/origins e política de dados; planejar backups/permissões e retenção. Não publicar assumindo que CORS ou gate React constituem autorização.

### Melhorias de testes

Preparar Python 3.11 com dependências travadas e executar offline/Stockfish. Separar verificação real de modelo/corpus das suites rápidas; registrar skips e ambiente. Acrescentar testes úteis para autorização, repetição, expiração, falhas de corpus/chave, invalidação de cache e ingestão concorrente. Usar poucos fluxos reais de browser para cookie/hash/modais e validação visual atual, sem substituir a suíte determinística por testes caros de LLM.

### Funcionalidades futuras possíveis

Jogo autônomo dos personagens, catálogo ampliado de exercícios, progressão por domínio, biblioteca/PGN de partidas, comentários persistentes e página completa de curiosidades. Exigem definição de escopo e implementação futura; não fazem parte da entrega atual nem desta auditoria.

## 27. Próximos passos sugeridos

1. Preparar ambiente backend Python 3.11 e registrar resultado offline atual; reparar teste frontend e rever divergências de texto antes de novos recursos.
2. Decidir política de acesso e completar autorização/limites de rotas, credenciais e propriedade de progresso.
3. Tornar análise robusta a falhas de LLM/RAG/aquecimento e preservar fatos da engine; garantir mensagens de estado do tabuleiro visíveis.
4. Corrigir semântica de histórico/empates/promoção e consolidar navegação/contratos de análise com testes focados.
5. Versionar cache/corpus e tornar ingestão transacional/coordenada; revisar reprodução de dependências e backup.
6. Validar corpus/modelos com amostra revisada e medir qualidade, latência, custo e carga da busca de dicas.
7. Melhorar acesso aos exercícios, conteúdo acessível, peso de assets e experiência de sessão.
8. Só então escolher novas funcionalidades (autonomia, persistência de partidas, cadastro/comentários), com escopo e critérios de aceitação próprios.

**Controle de alterações:** a auditoria altera somente `README.md` e cria `PROJECT_AUDIT.md`. Build/testes podem gerar artefatos ignorados em `frontend/dist`/caches; nenhum arquivo funcional rastreado foi editado. A verificação final usa `git diff`, `git diff --check` e `git status --short`, incluindo o arquivo novo que não aparece no diff comum antes de ser adicionado ao índice.

## Adendo — baseline técnica, etapa 1 (05/10/2026)

Este adendo registra uma rodada posterior à auditoria acima. Preserva os resultados históricos, mas supera a conclusão de indisponibilidade do ambiente backend: existe `.venv` **na raiz**, com Python 3.11.15 e dependências compatíveis. O Python global sem pytest não era o ambiente adequado. README.md modificado e PROJECT_AUDIT.md não rastreado já existiam no início desta etapa e foram preservados.

### Diagnóstico e correção

A suíte frontend inicial reproduziu **190 aprovados / 1 falha**, em 31 arquivos (37,48 s). O teste de navegação esperava `SOBRE O PROJETO`, mas `App.tsx`/`ContentModal` nomeiam corretamente o diálogo pelo título `SOBRE O PROJETO:`. Além disso, `[data-page="about"]` pertence ao acesso Sobre dentro da arena permanentemente montada: a ausência de `hidden` nesse elemento não comprova conclusão de navegação. O teste agora aguarda a arena ficar oculta e usa o nome acessível atual; mantém as verificações de hash, página, identidade do tabuleiro, FEN e pausa. Nenhum comportamento funcional foi alterado.

### Ambiente e reprodução

- macOS arm64; Python 3.11.15; pip 26.2.1; Node 24.16.0; npm 11.13.0.
- Frontend: Vite 8.3.1, Vitest 5.0.3, TypeScript 7.0.2, React 19.3.0.
- Backend: pytest 9.1.1, FastAPI 0.142.2, Pydantic 2.13.5, ChromaDB 1.5.9, Sentence Transformers 6.1.0, python-chess 1.999, httpx 0.28.1.
- Stockfish foi resolvido pela configuração existente em `/opt/homebrew/bin/stockfish` e respondeu ao handshake UCI como **Stockfish 19**. Nenhum caminho novo foi codificado.
- Nenhuma dependência foi instalada ou atualizada. `pip check` não encontrou requisitos quebrados.
- `backend/requirements-constraints.txt` fixa as 137 versões instaladas, incluindo transitivas; todas coincidem com o ambiente e satisfazem os requisitos declarados. Use `python -m pip install -r requirements.txt -c requirements-constraints.txt`. Isso preserva a estrutura pip/venv e os mínimos existentes. Não contém URLs privadas/editáveis ou valores de configuração. Não é lock com hashes; instalação limpa e compatibilidade em outras plataformas não foram executadas.

### Comandos realmente executados e resultados

Os comandos backend abaixo foram executados em `backend`, usando `../.venv/bin/python`, com `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ANTHROPIC_API_KEY='' OPENAI_API_KEY='' AQUECER_NA_INICIALIZACAO=false PYTHONDONTWRITEBYTECODE=1`. As chaves vazias são overrides de processo; nenhum `.env` foi alterado.

| Comando | Resultado |
| --- | --- |
| `cd frontend && npm test` — antes da correção | 190 aprovados, 1 falha; 31 arquivos; 37,48 s |
| `python -m pytest -m 'not llm and not modelo_real' --ignore=tests/test_concorrencia.py --ignore=tests/test_retrieval.py -p no:cacheprovider -q -ra` | 627 aprovados, 61 não selecionados; nenhum skip/falha; 7,76 s; concorrência/recuperação não coletadas nesta rodada inicial |
| `cd frontend && npm test` — depois da correção | **191 aprovados; 31 arquivos; 41,00 s** |
| `python -m pytest -m 'not llm' -p no:cacheprovider -q -ra` | **636 aprovados, 60 não selecionados; nenhum skip/falha; 19,39 s** |
| `cd frontend && npm run build` | Aprovado: `tsc --noEmit` e build Vite; JS 415,50 kB / gzip 129,25 kB; CSS 84,39 kB / gzip 25,48 kB |
| `.venv/bin/python -m pip check` — na raiz | Nenhum requisito quebrado |
| Script local com `ast.parse`, `packaging.Requirement` e `importlib.metadata.version` | Sintaxe válida em 59 módulos Python; requisitos atendidos; 137 constraints conferidas |
| Script local `caminho_do_stockfish()`, `abrir_motor()`, `engine.id`, `engine.quit()` | Stockfish 19 disponível via UCI e encerrado |

A rodada ampliada testou também busca no corpus local, embeddings reais em cache e concorrência de embeddings, além dos testes Stockfish e testes de API com dependências falsas. Masters usou respostas simuladas; não houve coleta FIDE real. Os 60 casos marcados `llm` foram **deliberadamente não selecionados**, não pulados por falha nem aprovados. Nenhum teste ficou bloqueado por dependência nesta cópia. Um clone sem corpus/cache pode ter skips ou falhas nesses testes de recursos locais. Não houve ingestão, chamada paga, execução integrada em navegador ou comprovação dos provedores externos. Não há comando de lint separado configurado; o typecheck existente foi executado pelo build.

### Limites e pendências preservadas

Autorização da API, vínculo de progresso, resiliência LLM/RAG, repetição de posições, promoção, status do tabuleiro, textos de privacidade, ingestão/cache e peso dos assets permanecem fora desta etapa. Partida contra adversário de IA permanece objetivo futuro e não foi implementada. O manifesto de constraints registra o ambiente testado, mas uma futura validação de instalação limpa ainda é necessária para comprovar reprodução desde zero.

Mudanças desta etapa: teste `frontend/src/match/MatchArena.test.tsx`, constraints Python e documentação README/adendo. Nenhum arquivo funcional foi alterado. A revisão final inclui `git diff --check`, `git status --short`, diff rastreado completo e inspeção dos arquivos não rastreados.

## Adendo — autenticação, autorização e identidade, etapa 2 (05/10/2026)

Este adendo supera os achados anteriores de autorização ausente (A1), progresso sem propriedade (parte de M8), falta de credenciais nas chamadas pedagógicas e ausência de reação da UI a 401. O histórico da auditoria e da etapa 1 foi preservado. Alterações preexistentes em README, PROJECT_AUDIT, MatchArena.test e requirements-constraints foram preservadas; os dois últimos não foram modificados nesta etapa.

### Diagnóstico confirmado e decisões

O código anterior realmente criava cookie HttpOnly/SameSite=lax/Secure configurável de sete dias com Path=/auth. authApi enviava credentials=include; api.ts não enviava credenciais. As rotas pedagógicas não exigiam sessão, e o UUID do cliente bastava para selecionar progresso. Nenhuma informação de credenciais ou sessão dos bancos locais foi lida.

| Método | Endpoint | Classificação | Motivo |
| --- | --- | --- | --- |
| GET | /health | PUBLIC | Diagnóstico de disponibilidade; sem dados pessoais |
| POST | /auth/login | PUBLIC | Entrada; mantém 5 tentativas/minuto por IP |
| GET | /auth/session | PUBLIC | Restauração; devolve usuário apenas com sessão válida, ou null |
| POST | /auth/logout | PUBLIC | Revogação idempotente, inclusive sem sessão |
| GET | /masters/ratings | PUBLIC | Dados públicos FIDE; cache limita refresh remoto a uma tentativa/24 h |
| GET | /openapi.json | PUBLIC | Schema da API, sem dados de usuários |
| GET | /docs | PUBLIC | Documentação da API |
| GET | /docs/oauth2-redirect | PUBLIC | Auxiliar automático da documentação |
| GET | /redoc | PUBLIC | Documentação da API |
| POST | /chat | AUTHENTICATED | Tutor/LLM e corpus privado |
| POST | /recomendar | AUTHENTICATED | Classificador e corpus |
| POST | /analisar | AUTHENTICATED | Stockfish/LLM/RAG |
| POST | /licao/proxima | AUTHENTICATED | Geração e mutação de progresso próprio |
| GET | /licao/atual | AUTHENTICATED | Leitura/geração de lição da conta |
| GET | /progresso/exercicios | AUTHENTICATED | Progresso privado da conta |
| GET | /documentos/{nome} | AUTHENTICATED | Arquivos do corpus local |
| GET | /documentos/{nome}/contexto | AUTHENTICATED | Trechos do corpus local |
| GET | /exercises/{exercise_id} | AUTHENTICATED | Catálogo interno de prática |
| POST | /exercises/{exercise_id}/validate | AUTHENTICATED | Cálculo e registro de tentativa própria |
| POST | /exercises/{exercise_id}/hint | AUTHENTICATED | Cálculo pedagógico |
| POST | /ingest | ADMIN | X-Admin-Token independente; vazio desativa; mantém 1/minuto |

### Implementação e migração

`auth.session_user` concentra consulta do hash SHA-256 do token, expiração e join da conta; `require_user` reutiliza essa consulta e devolve 401 sem sessão válida. As rotas privadas usam Depends; o router exercises também fica protegido quando montado isoladamente. POSTs privados verificam Origin quando presente, como login/logout. Nenhum JWT/OAuth/cadastro foi introduzido. Conexões auth agora têm fechamento explícito, resolvendo B10 no código.

Login mantém scrypt e token aleatório token_urlsafe(32), hash no SQLite, sete dias sem renovação; cookie tem Path=/, HttpOnly, SameSite=lax e Secure por ambiente. Login remove cookie legado /auth; logout revoga o hash e remove ambos os paths com os mesmos atributos. Cookies já instalados em /auth não autenticam outras rotas: é necessário novo login. Rate limit de login permanece 5/minuto. Masters público tem custo de refresh limitado pelo cache, mas ainda não possui limite de chamadas/CPU por cliente.

Migração aditiva no lifespan cria `progresso_owners(usuario_id PRIMARY KEY,email)` e `progresso_contas(email PRIMARY KEY,usuario_id UNIQUE)`. Nenhuma tabela/linha antiga é apagada ou reescrita. `identidade` usa transação BEGIN IMMEDIATE para resolver/criar ID padrão da conta e vincular IDs novos. UUID explícito pertencente a outra conta retorna 403 antes de gerar lição ou validar/registrar tentativa. UUID antigo com progresso e sem proprietário também retorna 403; conhecimento do UUID não comprova propriedade. Sem UUID, leitura de lições/progresso e validação usam identidade da sessão, e a prática registra tentativas mesmo antes de começar lições.

`associate_progress.py UUID EMAIL` é ferramenta exclusivamente local: verifica conta provisionada, associa legado sem substituir proprietário e seleciona o UUID como padrão da conta. Administrador precisa verificar quem é o proprietário antes de executar; nenhuma associação foi executada nos bancos reais desta máquina. Se já houver progresso novo, ele permanece armazenado/autorizado, mas deixa de ser o padrão; não há fusão automática. A migração preserva cache compartilhado de conteúdo de lições. E-mail normalizado é a identidade de conta existente; futuras partidas podem usar `require_user` e verificar proprietário do recurso, sem receber identidade confiável do cliente. Nenhuma rota de jogo foi criada.

No frontend, o ponto comum api.ts envia credentials=include; authApi já fazia isso. 401 privado emite evento antes de interpretar o corpo, inclusive em erro de exercício/corpo vazio. AuthProvider limpa usuário/UUID e dirige ao login; AuthGate desmonta App. Não há retry, chamada automática de logout ou loop de restauração. Respostas 401 de health/Masters não encerram sessão. Restauração/login/logout limpam o UUID compartilhado, sem apagar dados no servidor; App retoma lição pela sessão sem precisar desse valor. ExercisePanel consulta progresso mesmo sem UUID. PDFs abertos em nova aba usam cookie do navegador; 401 dessa navegação não emite evento para a SPA. SameSite=lax requer frontend/API no mesmo site no desenvolvimento (mesmo hostname, portas diferentes); produção cross-site não foi configurada.

### Pendências preservadas

A3 continua pendente: validate/hint autenticados ainda não possuem rate limit/timeout/concurrency budget; um usuário autenticado pode repetir trabalho caro. Não houve extensão parcial do limiter nesta etapa: os limites existentes foram preservados e verificados. M8 ainda inclui falta de idempotência de tentativas. Expiração é percebida na próxima resposta 401 privada, sem polling de sessão em UI ociosa. Progresso legado requer associação administrativa; fusão e mudança de e-mail da conta não possuem fluxo de produto. Permanecem A2/A4, repetição/promoção, status/textos de privacidade, ingestão/cache, peso dos assets e os demais problemas fora do escopo. Nenhum adversário IA, alteração de prompts/RAG/embeddings, redesign, upgrade, PGN ou etapa 3 foi implementado.

### Validação executada

| Comando | Resultado real |
| --- | --- |
| Frontend: `npm test` | **197 aprovados em 32 arquivos**, 38,52 s; baseline 191 em 31 |
| Frontend: `npm run build` | **Aprovado**, tsc --noEmit + Vite; JS 415,89 kB / gzip 129,33 kB; CSS 84,39 kB / gzip 25,48 kB |
| Backend: `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ANTHROPIC_API_KEY='' OPENAI_API_KEY='' AQUECER_NA_INICIALIZACAO=false PYTHONDONTWRITEBYTECODE=1 ../.venv/bin/python -m pytest -m 'not llm' -p no:cacheprovider -q -ra` | **654 aprovados, 60 não selecionados, nenhum skip/falha**, 17,44 s; baseline 636 |
| Backend: rodada focada de sessão/API/lições/documentos/exercícios/dicas/recomendações | 200 aprovados, 5,31 s, antes dos dois últimos testes de migração/forja |
| Revisão final | Diff rastreado completo e arquivos novos inspecionados; `git diff --check` sem erros; `git status --short` conferido |

Sessões reais dos testes usam contas e SQLite temporários. Testes anteriores de protocolo usam override explícito de require_user; os novos testes de autorização não substituem essa dependência. Cobertura inclui login válido/inválido e rate limit existentes, token forjado/expirado, revogação, cookie Secure/path/HttpOnly/SameSite/max-age, todas as rotas privadas sem sessão, rota privada com sessão válida, públicos/admin, leitura/mutação cruzada, legado preservado, migração repetida, criação concorrente de identidade e redirecionamento frontend sem retry. Nenhuma dependência foi instalada/atualizada, nenhum teste pago ou refresh real FIDE foi executado; corpus/cache/Stockfish locais são usados pela suíte offline como na baseline. Não houve execução integrada em navegador.

Arquivos da etapa 2: `backend/auth.py`, `backend/main.py`, `backend/progresso.py`, `backend/exercises/api.py`, novo `backend/associate_progress.py`; testes `test_authorization.py` (novo), `test_api.py`, `test_backend_v1.py`, `test_documentos.py`, `test_exercises_api.py`, `test_exercises_hints.py`, `test_recomendar.py`; frontend `App.tsx`, `api.ts`, `auth/AuthContext.tsx`, novo `auth/sessionEvents.ts`, `components/ExercisePanel.tsx`; testes `App.test.tsx`, `App.exercises.test.tsx`, `ExperienciaPedagogica.test.tsx`, `api.test.ts`, `auth/AuthGate.test.tsx`, novo `auth/authApi.test.ts`; README e este adendo. MatchArena.test e requirements-constraints continuam com o conteúdo preexistente da etapa 1. Não houve commit ou início da etapa 3.

## Adendo — análise enxadrística independente, etapa 3 (05/10/2026)

O início desta etapa apresentou `git status --short` vazio. O histórico e as implementações das etapas anteriores foram preservados. Este adendo supera A2 para o fluxo `/analisar` e corrige a falha de inicialização descrita em A4 quando o aquecimento lança exceção. Não afirma solucionar inicialização demorada/travada, imports ausentes nem todo timeout do tutor.

### Diagnóstico confirmado antes da extração

`main.analisar_fen` validava entrada com guardrails, chamava `analista.responder` e checava saída; todo esse trabalho compartilhava uma única thread/timeout em `executar`. O Analista validava FEN, detectava finais, abria UCI, calculava `score.white()`, validava até três lances da PV e fechava o processo. Só depois chamava `explicar_lance`, que instanciava LLM antes da busca. Ausência de chave escapava como LLMNaoConfigurado; falha de Chroma/corpus/embedding escapava da busca ou recomendação. Resultados calculados não chegavam à resposta nesses caminhos. Erros SDK de geração eram capturados e retornavam None, sem distinguir indisponibilidade de falta de contexto. Falha do juiz podia conservar explicação parcial. O timeout HTTP podia descartar todos os fatos esperando linguagem, cujo timeout padrão é maior. Os testes existentes cobriam falta de trechos, juiz recusando explicação, UCI real e fechamento após erro, mas não comprovavam resiliência a esses caminhos de configuração/recuperação/prazo.

Menor mudança adotada: extrair a implementação local do motor preservando uma fachada no Analista; produzir uma resposta de fatos antes da explicação; separar as duas etapas no endpoint dentro do prazo existente; acrescentar metadados opcionais ao contrato, sem mudar layout, prompts, provedor, embeddings ou conteúdo documental.

### Responsabilidades e contrato implementados

| Camada | Responsabilidade e limites |
| --- | --- |
| `chess_engine.py` / Stockfish + python-chess | FEN/validade, score, melhor lance, PV, status e fatos geométricos locais; validação/aplicação UCI. Sem imports LLM/retrieval/ingest/guardrails/LangChain. |
| Knowledge/RAG | Busca de contexto nos índices estrategia/fundamentos, fontes reais, conceitos e recomendação de leitura. Falhas são da explicação; perguntas documentais continuam dependentes de corpus. |
| Language/LLM | Explicação pedagógica estruturada e juiz; fatos enxadrísticos não são escritos nem escolhidos pelo LLM. Guardrails continuam verificando lances declarados, fundamentação e vazamento. |

`chess_engine.Analise` mantém campos usados pelo Analista/testes e acrescenta UCI, profundidade, perspectiva, status e vencedor. `analisar_posicao(fen, tempo)` aceita limite positivo/finito e devolve dados locais. `movimento_legal(fen, uci)` rejeita UCI inválido/ilegal; `aplicar_movimento` revalida no servidor e devolve FEN resultante, incluindo subpromoção explícita. Não há policy, seleção de adversário, pool complexo, persistência ou rota de game. Subpromoção da UI segue pendente.

A PV mantém o contrato de até três plies, SAN inglês em ordem e UCI correspondente; cada movimento é validado na posição resultante do anterior. Sufixo ilegal é descartado. Ausência de primeiro lance legal/score válido é erro do motor; não há lance inventado. Profundidade vem de `info.depth` quando inteiro não negativo, senão null. Não foi implementado MultiPV. “Determinístico” significa fatos calculados sem linguagem generativa: busca limitada por tempo pode fornecer score/PV diferentes entre execuções.

Perspectiva é sempre `white` por `score.white()`: centipeões positivos favorecem brancas, negativos pretas, independentemente do lado a jogar. Mate positivo é das brancas, negativo das pretas. Xeque-mate terminal identificado por python-chess tem mate=0 e vencedor explícito, sem lance/PV; afogamento/material insuficiente não recebem número inventado. FEN não fornece histórico necessário para repetição.

`Resposta.analise` é aditivo/opcional (null em outras respostas/ausente em caches antigos): `status=available|invalid_position|engine_error`, `dados`, `explicacao_status=available|unavailable|not_applicable`, `explicacao_erro=llm_error|retrieval_error|explanation_unavailable|explanation_timeout|null`. Dados incluem FEN, lado, perspectiva/tipo/score, SAN/UCI, profundidade, status/vencedor, características e texto de fim de jogo. Frontend espelha esses tipos e mantém apresentação atual por texto; parsing por regex (M10) continua pendente na UI.

### Fluxo e fallbacks

1. Sessão e rate limit existentes são verificados; autenticação/progresso não foram alterados.
2. Pydantic/guardrails validam entrada e o serviço valida FEN/posição. Rejeição por FEN continua mensagem legada HTTP 200 com `invalid_position`; erros de schema permanecem 422.
3. Motor analisa ou python-chess detecta terminal. Prepara dados estruturados, texto, fonte Stockfish, demo e prática, antes de recuperar documentos/criar LLM. Terminal usa resultado local sem fonte Stockfish inventada e `not_applicable` para explicação.
4. Ausência/falha de UCI/score/PV válida resulta em `engine_error`, sem dados calculados fictícios. Erros tratados mantêm HTTP 200 legado; ausência de sessão permanece 401.
5. Explicação usa o tempo restante de TIMEOUT_REQUISICAO contado monotonicamente, sem reiniciar um segundo orçamento inteiro. Ingestão em andamento limita só a explicação, não o motor.
6. Falha de criar modelo/provedor, gerar texto, validar saída malformada ou juiz gera `llm_error`; falha de buscar/documentos/embeddings/recomendação gera `retrieval_error`. Somente fatos, fonte Stockfish, demo e associações ficam preservados, com confiança zero e mensagem explícita de explicação indisponível. Juiz indisponível agora descarta explicação e registra falha; veredito parcial continua avisado/limitado como antes.
7. Ausência de explicação fundamentada/trechos ou bloqueio pelos guardrails gera `explanation_unavailable`; não finge explicação de IA. Guardrail de linguagem é aplicado antes de agregar fatos, evitando descartar análise por vazamento da explicação.
8. Timeout durante explicação retorna o snapshot de fatos com `explanation_timeout`; timeout antes de obter fatos resulta em `engine_error`. Falha de aquecimento lança apenas log seguro e permite subir API; disponibilidade de corpus não é presumida.

Logs distinguem invalid_position, engine_error, retrieval_error, llm_error e explanation_timeout; falhas opcionais registram somente classe/camada, não mensagem SDK, perguntas, documentos, chaves, tokens ou stack trace. Cliente recebe códigos/mensagens controladas. Busca documental essencial no tutor não foi convertida em sucesso fictício.

Cada análise não terminal possui processo próprio, sem compartilhar sessões UCI entre threads. `finally` chama quit e close, inclusive após erro; close ocorre mesmo se quit falhar. O motor fecha antes de RAG/LLM. Threads de explicação podem continuar após timeout até os limites de seus serviços; o snapshot retornado não é mutado por enriquecimento tardio. Limites globais/cancelamento de trabalho não foram implementados. Inicialização ainda espera o aquecimento terminar, embora uma exceção já não derrube a API.

### Escopo preservado e pendências

Sem adversário IA, Magnus/Hans autônomos, rotas game/move, policy, PGN, multiplayer, mudança de personalidade/biografias/comentários, upgrades, troca de provedor ou reingestão. `auth.py`, propriedade de progresso, retrieval.py, llm.py e prompts permanecem com o comportamento da etapa anterior. Adversário futuro poderá consumir melhor lance UCI, selecionar candidato por policy futura, revalidar/aplicar movimento e verificar propriedade da partida na aplicação. Isso ainda não é um sistema de jogo.

Permanecem A3, M2/M3/M4/M5/M6/M7/M9/M10/M12 e demais pendências fora da etapa: rate limit dos exercícios, histórico/repetição, promoção na UI, status/textos, cancelamento de threads, ingestão/cache, assets e checagem de todos os lances em texto livre. A confiança continua sendo da explicação; não certifica acerto. Avaliação independente do motor não torna todo tutor/RAG disponível sem corpus/modelo. Não houve verificação integrada em navegador ou dos provedores externos.

### Validação e arquivos desta etapa

Regressão frontend: `cd frontend && npm test` — **197 aprovados em 32 arquivos**, 43,80 s (baseline 197). `cd frontend && npm run build` — **aprovado**, typecheck e Vite; JS 415,89 kB / gzip 129,33 kB, CSS 84,39 kB / gzip 25,48 kB. O único arquivo frontend alterado é a tipagem aditiva; apresentação não foi redesenhada.

Backend foi executado em `backend` com a `.venv` existente:

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ANTHROPIC_API_KEY='' OPENAI_API_KEY='' AQUECER_NA_INICIALIZACAO=false PYTHONDONTWRITEBYTECODE=1 ../.venv/bin/python -m pytest -m 'not llm' -p no:cacheprovider -q -ra
```

Rodadas intermediárias: 146 testes existentes de análise/API/fluxos aprovados (4,71 s); 53 novos testes de engine/resiliência aprovados (3,64 s); suíte completa com 707 aprovados/60 não selecionados (26,69 s); depois 709 aprovados/60 não selecionados (19,87 s). Dois casos finais de saída de linguagem malformada foram acrescentados após a revisão, exigindo nova execução completa.

Testes novos cobrem legalidade/aplicação UCI (incluindo subpromoção no serviço), replay da PV/SAN, descarte de sufixo ilegal, primeiro lance/score ausentes, perspectiva positiva/negativa de CP/mate para ambos os lados a jogar, profundidade, status terminal, budgets inválidos, falta/erro de modelo/provedor, corpus/embedding/recomendação indisponíveis, juiz/saída malformada, guardrail bloqueando só a explicação, timeout HTTP preservando snapshot, ingestão em andamento, falha de aquecimento e sessão real da API. Teste em subprocesso comprova import/uso do serviço sem camadas de linguagem/recuperação. Novo conjunto UCI real cobre análises concorrentes com processos distintos encerrados, mates para brancas/pretas e endpoint sem LLM/corpus, além dos testes reais anteriores de Stockfish/fechamento após falha. Handshake separado pelo serviço confirmou **Stockfish 19**, encerrado em finally.

Não houve instalação/upgrade, alteração de `.env`, ingestão ou associação de progresso real, refresh FIDE, chamada paga/real a LLM ou teste integrado em navegador. Os 60 testes LLM foram excluídos deliberadamente, como na baseline. Modelos/índices locais continuam recursos necessários para parte da suíte offline. Os erros opcionais foram simulados; isso não comprova disponibilidade atual dos provedores.

Arquivos desta etapa (9): `backend/chess_engine.py` (novo serviço), `backend/agents/analista.py` (fachada/apresentação/enriquecimento), `backend/main.py` (fases/prazo/aquecimento), `backend/schemas.py` (dados/estados aditivos), `frontend/src/types.ts` (espelho do contrato), `backend/tests/test_chess_engine.py` e `backend/tests/test_analysis_resilience.py` (novos testes), README e este adendo. Revisão inclui diff rastreado completo, arquivos novos e whitespace; nenhum commit/deploy foi realizado. ETAPA 4 não iniciada.

Resultado final da execução completa após esses dois casos: **711 aprovados, 60 LLM não selecionados, nenhum skip/falha, 20,39 s** (baseline 654; 57 novos casos). Frontend mantém 197/197 e build aprovado. Não foram identificadas regressões nos checks executados. `git diff --check` aprovado e `git status --short` conferido com os nove arquivos acima, incluindo três novos.

## Adendo — histórico e regras da partida, etapa 4 (05/10/2026)

O início desta etapa apresentou Git limpo. A inspeção confirmou chess.js 1.4.0 instalado e recriação por FEN em `tentarLance`/`situacao`, perdendo a pilha necessária à repetição. As etapas anteriores foram preservadas.

### Modelo e política implementados

App mantém snapshots em memória, mas reconstrói todos os movimentos legais desde o primeiro FEN com `jogoDoHistorico`; a instância reconstruída conserva a pilha de movimentos e é memoizada. Novos snapshots são aceitos apenas quando correspondem a movimento legal da sequência oficial. Estado estruturado contém status, turno, vencedor e encerramento. Status distingue playing/check/checkmate/stalemate/insufficient_material/repetition/fifty_move/draw. O motivo de término é o próprio status; não há vencedor em empate. Xeque permite continuação. Mate, afogamento e empates bloqueiam entrada e contagem de atividade.

A política do produto encerra automaticamente na terceira repetição e após cinquenta lances sem captura/movimento de peão, quando o critério já foi atingido. Não implementa reclamação FIDE nem previsão de reclamação pelo próximo lance. FEN sozinho não confirma repetição. Histórico inválido/continuação terminal é rejeitado; partida inicial pode ser reconstruída após reset. Não houve entidade persistente Game nem novo endpoint.

Replay usa índice/exibição separados e bloqueia movimentação; não reconstrói o estado oficial a partir do snapshot selecionado. Voltar à posição atual conserva resultado. Desfazer existente remove explicitamente o último snapshot e recalcula resultado; reset limpa histórico, seleção, atividade e análises como antes. Demonstração/prática mantêm suas posições próprias e contratos anteriores.

Promoção normal abre escolha de dama/torre/bispo/cavalo antes de emitir FEN. Cancelar/Escape preserva posição. Mudança de posição/modo/ocupação dispensa escolha pendente; candidato é revalidado ao confirmar. O helper mantém padrão dama para consumidores antigos, mas a arena exige escolha. Contexto/status antes oculto agora fica visível em região aria-live, sem alteração de CSS ou redesign.

Backend acrescenta primitivas sem LLM: estado de tabuleiro/posição, reconstrução de histórico UCI, enumeração legal e aplicação em cópia reconstruída. Entradas não são mutadas. História inválida, turno incorreto, UCI/promoção ilegal e continuação terminal são recusados. Primitivas antigas de posição e análise Stockfish continuam recebendo FEN; legalidade de posição não constitui prova de histórico de partida. Uma futura Game poderá usar FEN inicial + movimentos, id/proprietário, estado/turno/vencedor e datas; aplicação deverá verificar sessão/propriedade. Ainda não existe adversário IA.

### Verificação e limites

Backend completo offline: `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ANTHROPIC_API_KEY='' OPENAI_API_KEY='' AQUECER_NA_INICIALIZACAO=false PYTHONDONTWRITEBYTECODE=1 ../.venv/bin/python -m pytest -m 'not llm' -p no:cacheprovider -q -ra`, executado em backend: **726 aprovados, 60 não selecionados, nenhum skip/falha, 28,54 s**. Os 15 novos casos cobrem repetição real/FEN isolado, bloqueio terminal, quatro promoções, entradas ilegais, estados, mate e lista legal. Suíte preserva autorização e Stockfish locais. Sem chamada real LLM/FIDE, instalação, ingestão ou alteração de dados privados.

Frontend recebeu testes de regras/estados, quatro escolhas de promoção, cancelamento, bloqueio terminal e integração de repetição/replay/desfazer/reset. A primeira execução simultânea com backend teve cinco timeouts; a segunda isolada aprovou 213/214, com única expectativa antiga de contexto oculto. Essa expectativa foi atualizada para estado visível. Nenhum timeout foi relaxado.

Arquivos: backend/chess_engine.py; novo backend/tests/test_game_rules.py; frontend/src/lances.ts; App.tsx; components/Board.tsx; components/Board.test.tsx; App.modals.test.tsx; novo gameRules.test.ts; README.md; este adendo. Persistência/PGN, jogo contra IA, multiplayer, cancelamento global, limites dos exercícios, ingestão/cache, peso dos assets e textos de privacidade seguem pendentes. Não houve teste integrado em navegador; responsividade visual real não foi confirmada. Sem commit/deploy e sem etapa 5.

Resultado final frontend: `cd frontend && npm test` — **215 aprovados em 33 arquivos, 37,68 s** (baseline 197/32). Verificação final focada `npm test -- src/App.modals.test.tsx` — **10 aprovados, 3,44 s**, incluindo integração completa de repetição, bloqueio, replay, desfazer e reset. `npm run build` — **aprovado**, TypeScript noEmit + Vite; JS 417,90 kB / gzip 130,00 kB; CSS 84,39 kB / gzip 25,48 kB. Revisão do diff e arquivos novos realizada; `git diff --check` sem erros; status final contém os dez arquivos listados. Não foram identificadas regressões funcionais nos checks finais; timeouts intermediários ficaram registrados acima.
