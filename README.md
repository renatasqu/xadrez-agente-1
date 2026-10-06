# Xadrez Multiagente

## Visão geral

Aplicação de aprendizagem de xadrez em português, com tabuleiro interativo, tutor baseado em documentos, análise de posições com Stockfish, lições e exercícios curados. A interface usa pixel art e chama os lados brancos e pretos de **Magnus** e **Hans**.

**No modo manual, a pessoa movimenta os dois lados; em “Jogar contra IA”, enfrenta um adversário Stockfish funcional.** Magnus e Hans continuam sendo nomes visuais, sem personalidades próprias: seus painéis exibem análises solicitadas pelo usuário. Os papéis de linguagem realmente implementados no backend são Árbitro, Professor, Estrategista, Analista e Roteador.

Projeto originado na atividade acadêmica “Recuperando documentos úteis para aprender um esporte”. Esta descrição foi conferida no código em **05/10/2026**. O mapa técnico, evidências, limites de verificação e recomendações estão em [PROJECT_AUDIT.md](PROJECT_AUDIT.md).

## Funcionalidades atuais

- Login pessoal no backend, sessão por cookie HttpOnly e logout com revogação; cadastro público desativado.
- Tabuleiro com movimentos legais por clique/arraste, promoção automática a dama, desfazer, reiniciar e navegação/reprodução do histórico local.
- Análise sob demanda: Stockfish calcula melhor lance, avaliação e até três lances da linha principal; o sistema procura uma explicação documental.
- Tutor com pergunta livre, posição opcional, fontes, confiança, recomendações de leitura e demonstrações no tabuleiro.
- Currículo de 12 lições, cache de conteúdo e progresso por UUID vinculado à conta autenticada.
- Seis exercícios curados: movimento do cavalo, três perguntas sobre roque, garfo com ganho material e prevenção de perda material. Validação e dicas são determinísticas, sem LLM.
- Masters: biografias e imagens locais de Hans Niemann, Magnus Carlsen e Judit Polgár; rating clássico e ranking consultados nos perfis FIDE pelo backend, com cache diário.
- Carrossel de quatro imagens de curiosidades, a cada dez segundos, pausado ao receber foco ou hover.
- Modais do tutor, lições, Sobre, documentação e comentário/like; atalhos flutuantes do tutor e das lições.
- Status do backend atualizado a cada minuto.

A existência dessas implementações não comprova a disponibilidade atual de serviços externos. Comentários e likes são demonstrativos e não têm persistência. A página separada de curiosidades contém apenas um texto provisório.

## Experiência do usuário

1. O frontend consulta `/auth/session`. Sem sessão válida, mostra o login; a conta precisa ter sido provisionada localmente.
2. Depois de entrar, abre a partida. A pessoa pode mover brancas e pretas, consultar o histórico e pedir uma análise.
3. O tutor abre em modal; permite perguntar, anexar a posição atual ou pedir indicações de leitura. Cada chamada é independente: o histórico do chat não é enviado ao modelo.
4. Uma resposta pode oferecer “Ver no tabuleiro” ou “Praticar este conceito”. Demonstrações e exercícios usam posições próprias e preservam a partida enquanto estão abertos.
5. As lições avançam quando o backend entrega conteúdo com fontes; não exigem aprovação em exercícios para avançar.
6. Masters e Lições também têm áreas próprias. Navegar para outra área pausa a partida; ao voltar, o botão Continuar retoma a interação.
7. Sair encerra a sessão. Atualizar a página ou remontar a aplicação perde a partida e o chat, que ficam apenas em memória.

## Páginas e seções

As URLs usam fragmentos (`#`), tratados por `AuthGate.tsx` e `App.tsx`; não há React Router nem páginas do servidor para esses caminhos.

| Entrada | Conteúdo atual |
| --- | --- |
| `/#/login` | Login com e-mail e senha. |
| `/#/cadastro` | Formulário presente, mas envio recusado: cadastro desativado. |
| `/#/partida` e `/#partida` | Arena, tabuleiro e controles. |
| `/#historico-partida` | Histórico da partida em memória. |
| `/#agentes` | Painéis das análises de Magnus/brancas e Hans/pretas. |
| `/#/masters` | Três perfis, biografias locais e ratings FIDE via backend. |
| `/#/licoes` | Lição atual, próxima lição e prática relacionada. |
| `/#/sobre` | Abre o modal Sobre; o texto da interface tem divergências documentadas na auditoria. |
| `/#/curiosidades` | Placeholder; o carrossel real fica na arena. Não há link no menu atual. |
| `/#/` | Tela simples com “Iniciar partida”, quando autenticado. |
| Botões da arena/flutuantes | Tutor, lições, comentários/like e documentação em modais, sem rota dedicada. |

## Frontend

React 19 + TypeScript, servido por Vite; `react-chessboard` desenha o tabuleiro e `chess.js` valida lances locais. `src/main.tsx` monta `AuthProvider → AuthGate → App`. Estado com hooks React; autenticação em Context e exercícios em reducer/hook próprio. Sem Redux ou roteador externo.

`src/App.tsx` coordena partida, chat, análises, lições, demonstrações e modais. `src/components/` reúne telas e componentes; `src/match/` apresenta histórico, turnos e controles; `src/exercises/` administra a sessão pedagógica. `src/api.ts` centraliza `fetch`, credenciais e erros; `src/auth/authApi.ts` também envia cookies nas chamadas de autenticação. Respostas 401 privadas encerram o estado autenticado e retornam ao login.

Estilos combinam Tailwind CSS 4, CSS global e folhas de Masters/carrossel. Pixelify Sans e Inter são fontes locais; Press Start 2P continua importada como alternativa. Peças e avatares são grades renderizadas em SVG; imagens de Masters/login/atalhos ficam em `src/assets`, e logo/carrossel/fontes em `public`. Os tiles antigos permanecem no script de prévia, mas o tabuleiro atual usa cores sólidas.

## Backend

FastAPI em Python, com contratos Pydantic, LangGraph para roteamento, LangChain para provedores de linguagem, ChromaDB e Sentence Transformers para recuperação documental. Stockfish é um executável externo, acessado pelo protocolo UCI com `python-chess`.

| Grupo | Endpoints |
| --- | --- |
| Autenticação | `POST /auth/login`, `GET /auth/session`, `POST /auth/logout` |
| Saúde e Masters | `GET /health`, `GET /masters/ratings` |
| Tutor/análise | `POST /chat`, `POST /recomendar`, `POST /analisar` |
| Lições/progresso | `POST /licao/proxima`, `GET /licao/atual`, `GET /progresso/exercicios` |
| Exercícios | `GET /exercises/{exercise_id}`, `POST /exercises/{exercise_id}/validate`, `POST /exercises/{exercise_id}/hint` |
| Partidas persistentes | `POST /games`, `GET /games/{game_id}`, `POST /games/{game_id}/moves`, `POST /games/{game_id}/agent-move` |
| Documentos | `GET /documentos/{nome}`, `GET /documentos/{nome}/contexto` |
| Administração | `POST /ingest`, protegido por `X-Admin-Token`, desativado sem token configurado |
| Documentação automática | `/docs`, `/redoc`, `/openapi.json` |

Persistência local: SQLite para contas/sessões, progresso/cache de lições, partidas e cache de ratings; ChromaDB em disco para documentos. Partidas contra IA usam Game persistente e API autoritativa, com StockfishPolicy e integração visual. Comentários e likes não têm backend.

**Etapa 2: autorização no backend.** Tutor, recomendações, análise, lições, progresso, exercícios e documentos exigem sessão válida. Health, autenticação, documentação FastAPI e Masters permanecem públicos; `/ingest` exige o segredo administrativo independente. A etapa 5 também exige sessão e proprietário nas rotas de Game. O UUID de progresso é verificado contra a conta autenticada. CORS e limites por IP não substituem autorização.

O cookie `xadrez_session` usa `Path=/`, HttpOnly, SameSite=lax, validade de sete dias e Secure configurável por `AUTH_COOKIE_SECURE`. Logout revoga a sessão SQLite e remove cookies nos paths atual e legado (`/auth`). Cookies antigos exigem novo login para acessar rotas privadas.

Progresso antigo não é apagado nem associado automaticamente a quem informa um UUID. Após verificar localmente quem é o proprietário, execute em `backend`, com a API parada para manutenção:

```bash
../.venv/bin/python associate_progress.py UUID_LEGADO email@exemplo.com
```

A ferramenta exige conta provisionada, recusa substituir proprietário e seleciona esse UUID como progresso padrão da conta. Outros IDs/dados existentes são preservados; não há fusão automática. Sem UUID, rotas de lição/progresso e validação usam a identidade padrão da sessão. O frontend limpa o UUID compartilhado ao restaurar/entrar/sair da sessão e retoma o progresso pelo backend.

## Inteligência artificial e xadrez

- **Stockfish/python-chess:** serviço reutilizável em `backend/chess_engine.py` valida FEN, calcula avaliação/melhor lance/PV e valida/aplica candidatos UCI, sem importar LLM, RAG ou embeddings. StockfishPolicy também usa esse serviço para escolher lances do adversário, revalidados pelo servidor.
- **LLM:** classifica perguntas, escreve explicações e verifica fundamentação. `backend/llm.py` suporta Anthropic, OpenAI ou Ollama. Os nomes configurados são descritos abaixo como valores do código, sem garantia de disponibilidade no provedor.
- **RAG real:** PDFs/TXTs são limpos, divididos em trechos de até 800 caracteres com sobreposição de 100, vetorizados com `intfloat/multilingual-e5-base` e armazenados em três coleções ChromaDB. A busca expande termos de xadrez português/inglês e filtra por similaridade.
- **Referências curadas:** definições básicas reconhecidas usam resumos FIDE de `regras_curadas.py`, sem busca vetorial; a redação da resposta no chat ainda usa LLM.
- **Tutor:** roteador escolhe Árbitro, Professor, Estrategista ou Analista. Fontes vêm do código/busca; o juiz pode recusar a explicação ou reduzir confiança.
- **Exercícios/dicas:** catálogo fixo e cálculos com `python-chess`. A3 verifica conversão do garfo em até quatro plies; E1 limita segurança material a três plies. Não são análises gerais de partidas.
- **Magnus/Hans, AlphaZero, Leela e Transformers:** Magnus/Hans são identidades visuais; os demais aparecem em conteúdo informativo. Não existe integração executável com AlphaZero ou Leela.

### Análise independente — etapa 3

`POST /analisar` continua autenticado e mantém texto, fonte Stockfish, demonstração e prática relacionada. Primeiro valida a entrada e calcula os fatos; depois tenta enriquecê-los com contexto documental e linguagem. RAG recupera trechos/conceitos; LLM escreve a explicação e o juiz verifica fundamentação. Falha opcional não elimina fatos, PV ou demonstração já calculados.

O campo aditivo `analise` separa `status` (`available`, `invalid_position`, `engine_error`), `dados`, `explicacao_status` (`available`, `unavailable`, `not_applicable`) e `explicacao_erro`. Erros tratados mantêm o formato HTTP 200 legado com estado explícito; schema inválido continua 422 e ausência de sessão continua 401. Respostas antigas/cache sem esse campo continuam válidos.

`dados` contém FEN, lado a jogar, perspectiva `white`, tipo de avaliação (`centipawn`/`mate` ou null), centipeões/mate, melhor lance e PV em SAN inglês/UCI (até três plies), profundidade se fornecida, status terminal e características locais. **Score positivo favorece brancas e negativo favorece pretas**, mesmo quando pretas jogam. Mate positivo significa brancas dando mate, negativo significa pretas; mate terminal tem valor 0 e vencedor explícito. Afogamento/material insuficiente não recebem score inventado. Posições terminais são identificadas por python-chess sem abrir Stockfish.

Sem chave, falha de provedor/modelo/juiz ou timeout do provedor: análise preservada e explicação indisponível (`llm_error`). Falha de corpus/embedding/recuperação ou ingestão em andamento: fatos preservados, sem referências documentais inventadas (`retrieval_error`). Sem explicação apoiada ou bloqueada pelos guardrails: `explanation_unavailable`. O prazo HTTP é compartilhado entre as duas etapas; expiração enquanto aguarda explicação retorna os fatos com `explanation_timeout`. Falha/ausência do motor é `engine_error`, sem avaliação inventada. Confiança continua se referindo à explicação, não à probabilidade de acerto do motor.

Cada análise não terminal abre processo UCI próprio e executa quit/close em finally. O motor já está fechado antes da explicação. Threads não são interrompidas pelo timeout HTTP; trabalho de linguagem pode continuar até seu limite próprio. Uma falha durante aquecimento de embeddings agora é registrada e permite iniciar a API; consultas que dependem do corpus ainda podem falhar. Inicialização demorada/travada do aquecimento não foi resolvida.

FEN isolado não preserva repetição; scores de busca limitada por tempo podem variar entre execuções. Não há MultiPV, implementação de policy ou loop de adversário. A etapa 5 acrescenta endpoints de partida, descritos abaixo. Uma etapa futura poderá usar `analisar_posicao` → candidato UCI → `movimento_legal` → `aplicar_movimento`, com propriedade da partida na camada de aplicação.

## Fontes externas e APIs

| Fonte/serviço | Uso |
| --- | --- |
| Anthropic / OpenAI | API de linguagem no backend, conforme `LLM_PROVIDER`; perguntas e trechos podem ser enviados ao provedor escolhido. |
| Ollama | Alternativa local de linguagem. |
| Hugging Face / Sentence Transformers | Carregamento do modelo de embeddings, podendo exigir download inicial. |
| Perfis FIDE (`ratings.fide.com/profile/{id}`) | Coleta HTML de rating clássico/ranking de três jogadores; atualização preguiçosa com intervalo de 24 h. |
| FIDE Handbook, Project Gutenberg e Exeter Chess Club | Fontes dos documentos instalados manualmente; não há download desses livros pela aplicação. |
| Stockfish | Engine local, não API remota. |

### Documentos para recuperação

O Git contém somente `backend/docs/.gitkeep`. Nesta cópia de trabalho existem os quatro primeiros documentos abaixo e um ChromaDB com 775 trechos; esses dados locais não acompanham um clone novo.

| Nome esperado | Coleção | Origem registrada no projeto |
| --- | --- | --- |
| `Laws_of_Chess-2023.pdf` | regras | [FIDE Handbook E.01](https://handbook.fide.com/chapter/E012023), exportado em PDF. |
| `capablanca_chess_fundamentals.txt` | fundamentos | [Project Gutenberg #33870](https://www.gutenberg.org/ebooks/33870), Plain Text UTF-8. |
| `staunton_blue_book.txt` | fundamentos | [Project Gutenberg #16377](https://www.gutenberg.org/ebooks/16377), Plain Text UTF-8. |
| `regis_tactics.pdf` | estrategia | [Curso de Dave Regis](https://exeterchessclub.org.uk/chessx/pdf/TacticsCourse.pdf), renomeado. |
| `lasker_manual.pdf` | estrategia | Complementar opcional cadastrado em `backend/config.py`; ausente nesta cópia e sem instrução de obtenção confirmada. |

Os links preservam as fontes documentadas; sua disponibilidade e a autenticidade dos arquivos locais não foram verificadas nesta auditoria. Arquivos faltantes geram aviso na ingestão, que continua com os disponíveis. As licenças de cada documento são próprias.

## Como executar localmente

Use Python 3.11 e Node 24 para os comandos abaixo. O Vite instalado aceita Node `^20.19.0 || >=22.12.0`, mas o Vitest instalado exige `^22.12.0 || ^24.0.0 || >=26.0.0`; o script de prévia também executa TypeScript diretamente com Node. Instale Stockfish separadamente para jogar contra IA; configure um provedor de linguagem para tutor/explicações.

Na raiz:

```bash
cp .env.example .env
# Edite .env: provedor, chave correspondente e STOCKFISH_PATH.
cd backend
python3.11 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt -c requirements-constraints.txt
```

A baseline usa Python **3.11.15**. `requirements-constraints.txt` fixa as versões diretas e transitivas do ambiente validado em macOS arm64, sem mudar os mínimos de `requirements.txt`. Uma instalação limpa e outras plataformas ainda não foram verificadas; modelo, corpus e Stockfish são recursos separados. Nesta cópia já existe `.venv` na raiz: pode-se ativá-la com `source .venv/bin/activate` antes de entrar em `backend`, sem reinstalar dependências.

Para usar RAG aberto, coloque os documentos em `backend/docs/` e gere os índices **uma vez**, ou quando desejar substituí-los:

```bash
python ingest.py
```

A ingestão recria coleções existentes. Não precisa ser repetida em todo início; o script direto não limpa o cache SQLite das lições, ao contrário de `POST /ingest`.

Provisione a conta e inicie a API:

```bash
python configure_owner.py
uvicorn main:app --reload
# http://localhost:8000/docs
```

`configure_owner.py` solicita nome, e-mail e senha no terminal. O aquecimento de embeddings está habilitado por padrão: uma instalação nova pode precisar baixar o modelo antes de a API atender. Para iniciar sem esse aquecimento, use `AQUECER_NA_INICIALIZACAO=false`; isso não cria índices nem torna o RAG aberto disponível.

Em outro terminal, a partir da raiz:

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
# http://localhost:5173
```

O pacote Node está em `frontend`, não na raiz. A porta 5173 é fixa no Vite e a origem padrão liberada no backend. Use o mesmo hostname para frontend/backend durante login local. Para HTTPS, configure `AUTH_COOKIE_SECURE=true` e ajuste `CORS_ORIGENS`.

Outros comandos existentes: `npm run build`, `npm run preview`, `npm run previa` (prévia antiga dos sprites) e `python testar_agente.py roteador "Como funciona o roque?"`. Esses comandos não adicionam modos de jogo.

## Variáveis de ambiente

Backend: `backend/config.py` lê `.env` da raiz e de `backend`; frontend: `.env` dentro de `frontend`. Nenhum valor privado é necessário nos documentos.

| Variável | Uso/padrão do código |
| --- | --- |
| `LLM_PROVIDER` | `anthropic`, `openai` ou `ollama`; padrão `anthropic`. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Chave do provedor selecionado; nunca colocar em `VITE_*`. |
| `CLASSIFIER_MODEL`, `AGENT_MODEL`, `JUDGE_MODEL` | Padrões configurados: `claude-haiku-4-5-20251001`, `claude-sonnet-5-5`, `claude-haiku-4-5-20251001`. Compatibilidade externa não confirmada. |
| `OPENAI_MODEL`, `OLLAMA_MODEL` | Padrões `gpt-4o-mini`, `llama3.1`. |
| `STOCKFISH_PATH`, `STOCKFISH_TEMPO` | Executável (padrão `/opt/homebrew/bin/stockfish`) e análise de 1 s. |
| `MIN_SCORE`, `EMBEDDING_MODEL` | `0.79`, `intfloat/multilingual-e5-base`. |
| `ADMIN_TOKEN` | Autoriza `POST /ingest`; vazio desativa a rota. |
| `CORS_ORIGENS` | Lista JSON; padrão `["http://localhost:5173"]`. |
| `AUTH_COOKIE_SECURE`, `DB_AUTH` | Cookie HTTPS e caminho do SQLite de autenticação. |
| `DB_PROGRESSO`, `DOCS_DIR`, `CHROMA_DIR` | Caminhos da persistência e corpus. |
| `AQUECER_NA_INICIALIZACAO` | `true`, carrega embeddings ao iniciar. |
| `LLM_TIMEOUT`, `LLM_TIMEOUT_RAPIDO`, `TIMEOUT_REQUISICAO` | 60 s, 15 s e 30 s. |
| `RATE_LIMIT`, `VERIFICAR_FUNDAMENTACAO` | `20/minute`, `true`. |
| `MASTERS_CACHE_PATH` | SQLite de Masters; lida diretamente do ambiente de processo em `masters.py`, não pelo carregador de `.env` de `Settings`. |
| `VITE_API_URL` | Frontend: `http://localhost:8000`. Incorporada no build. |

A lista integral das configurações, incluindo limites e prefixos de embeddings, está na seção 2 da [auditoria](PROJECT_AUDIT.md).

## Testes

```bash
# Backend, dentro do ambiente virtual e da pasta backend:
python -m pytest -m 'not llm and not modelo_real'
# Inclui o teste de embeddings reais, se modelo/dependências estiverem disponíveis:
python -m pytest
# Chamadas reais de linguagem, com custo conforme provedor:
python -m pytest -m llm

# Frontend, dentro de frontend:
npm test
npm run build
```

Há testes de API, autenticação, agentes, guardrails, recuperação/ingestão, documentos, Stockfish, concorrência, Masters e exercícios no backend; no frontend, testes de componentes, autenticação, HTTP, partida, modais e fluxos pedagógicos. Avaliações manuais ficam em `backend/eval/`.

**Baseline da etapa 1 (05/10/2026):** frontend **191/191 aprovados em 31 arquivos**; build e typecheck aprovados. Backend no ambiente `.venv` existente, Python 3.11.15: **636 aprovados, 60 testes LLM não selecionados, nenhum skip/falha**, com Stockfish 19, corpus local e embeddings em cache offline. Não houve instalação/upgrade, chamada real a LLM/FIDE ou teste integrado em navegador. A falha inicial de navegação foi corrigida apenas no teste: espera pelo estado da arena e título acessível atual do modal. A conclusão anterior de indisponibilidade do ambiente backend fica superada pela descoberta da `.venv` da raiz. Comandos, limites e resultados estão no adendo de baseline de [PROJECT_AUDIT.md](PROJECT_AUDIT.md).

**Etapa 2 (05/10/2026):** frontend **197/197 em 32 arquivos**, build/typecheck aprovado; backend **654 aprovados, 60 LLM não selecionados, nenhum skip/falha** nas mesmas condições offline. Novos testes cobrem sessão real, cookies, rotas públicas/privadas, propriedade, migração aditiva, concorrência da identidade, credentials e reação a 401. Sem chamadas reais/pagas de LLM, refresh FIDE ou navegador integrado.

**Etapa 3 (05/10/2026):** frontend **197/197 em 32 arquivos**, build/typecheck aprovado; backend **711 aprovados, 60 LLM não selecionados, nenhum skip/falha** (baseline 654). Serviço Stockfish 19 independente de linguagem/recuperação, com testes reais e falhas simuladas. Sem chamadas pagas ou adversário IA implementado.

Para reproduzir a rodada local sem LLM/download de modelo, a partir de `backend` com o ambiente ativado:

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ANTHROPIC_API_KEY='' OPENAI_API_KEY='' AQUECER_NA_INICIALIZACAO=false PYTHONDONTWRITEBYTECODE=1 python -m pytest -m 'not llm' -p no:cacheprovider -q -ra
```

Essa rodada inclui testes reais de embeddings/concorrência e recuperação: exige modelo em cache e índices locais. O marcador `not modelo_real` sozinho não exclui todos esses testes; para a rodada inicial sem esses recursos também foram usados `--ignore=tests/test_concorrencia.py --ignore=tests/test_retrieval.py`.

## Estrutura do projeto

```text
README.md                  Guia do estado atual e execução
PROJECT_AUDIT.md           Inventário detalhado, riscos e próximos passos
BACKEND_V1.md              Registro da integração pedagógica V1
CLAUDE.md / PROMPTS.md     Decisões e roteiro histórico de desenvolvimento
backend/
  main.py / config.py     Aplicação FastAPI e configurações
  auth.py                 Conta local e sessões
  masters.py              Adaptador FIDE e cache diário
  chess_engine.py         Serviço independente de engine e legalidade
  agents/                 Roteador, papéis documentais, análise e demonstrações
  exercises/              Catálogo, contratos, validação e dicas
  ingest.py / retrieval.py Embeddings e recuperação ChromaDB
  documentos.py           Acesso seguro aos arquivos
  progresso.py            SQLite de lições e exercícios
  docs/                   Documentos locais, ignorados pelo Git
  tests/ / eval/          Testes e avaliações
frontend/
  package.json            Scripts e dependências Node
  src/App.tsx             Coordenação da arena e áreas
  src/auth/               Login, gate e Context
  src/components/         Tabuleiro, tutor, modais e conteúdo
  src/match/              Turno, histórico e controles
  src/exercises/          Estado, feedback e visualização pedagógica
  src/pixel/              Grades, peças, ícones e sprites SVG
  src/assets/ / public/   Imagens e fontes locais
  qa-visual/              Evidências históricas de layout
```

## Estado atual

O núcleo interativo e os fluxos pedagógicos estão implementados e possuem cobertura automatizada. Há integração real de engine, recuperação documental e provedores de linguagem no código, mas a operação completa depende do ambiente e dos serviços configurados.

Continuam incompletos: jogo autônomo Magnus × Hans, cadastro público, listagem/retomada de partidas pela UI, armazenamento de chat, comentários/likes persistentes, página completa de curiosidades e avaliação ampliada do RAG. A etapa 2 resolveu a autorização das rotas privadas, a propriedade do progresso e a reação da interface a 401. A etapa 3 preserva fatos de análise diante de falhas LLM/RAG. Permanecem pendentes limites de taxa/concorrência dos exercícios, cancelamento de threads e demais itens indicados no adendo de [PROJECT_AUDIT.md](PROJECT_AUDIT.md).

## Licença e créditos

[GPL-3.0](LICENSE). O projeto usa `python-chess`; Stockfish é instalado separadamente e não distribuído neste repositório. Documentos de terceiros têm licenças próprias. Inter e Pixelify Sans têm arquivos OFL em `frontend/public/fonts/`; Press Start 2P vem de `@fontsource`. A documentação histórica registra o uso de Claude/Claude Code no desenvolvimento, sem que esta auditoria valide a autoria individual dos assets.

### Regras da partida local — etapa 4

A partida manual reconstrói o histórico legal completo em chess.js 1.4.0; os FENs continuam como snapshots de apresentação. O estado oficial distingue turno, xeque, mate/vencedor, afogamento, material insuficiente, repetição tripla e cinquenta lances. Nesta aplicação os dois últimos encerram automaticamente ao atingir o critério, sem formulário de reclamação ou antecipação de lance futuro. Movimentos ficam bloqueados após o fim. Desfazer altera explicitamente o histórico; reiniciar limpa a partida. Navegação/replay não alteram o resultado oficial.

Promoção na arena aguarda escolha de dama, torre, bispo ou cavalo; cancelar/Escape preserva a posição. Demonstrações e exercícios mantêm seus contratos próprios. O contexto da arena agora apresenta avisos de estado.

No backend, `reconstruir_partida`, `estado_tabuleiro`, `estado_posicao`, `lances_legais` e `aplicar_na_partida` são primitivas locais sem persistência. Histórico UCI é revalidado e não aceita continuação após o fim. As funções anteriores de posição/análise seguem recebendo FEN isolado: não confirmam repetição. Nenhum endpoint de partida ou adversário IA foi criado. Uma futura entidade Game deverá guardar identidade/proprietário, FEN inicial, movimentos, estado atual e datas; sessão/propriedade devem ser verificadas pela aplicação.

### Game persistente e API autoritativa — etapa 5

`backend/games.py` usa o mesmo arquivo `DB_PROGRESSO`, com migração aditiva/idempotente de `games` e `game_move_requests` no lifespan. Nenhum dado existente é apagado. A fonte de verdade é `initial_fen` + lista ordenada de movimentos UCI. FEN atual, SAN quando necessário, turno, status, vencedor e terminal são derivados por python-chess, reutilizando as regras da etapa 4. Não se armazena uma lista de FENs como histórico oficial. Cada operação abre/fecha sua conexão SQLite.

Game guarda UUID v4, proprietário derivado do e-mail normalizado da sessão, FEN inicial, movimentos, cor humana, agent_id reservado `stockfish`, timestamps UTC e revisão. A resposta não expõe proprietário: inclui `id`, `initial_fen`, `current_fen`, `moves`, `human_color`, `side_to_move`, `status`, `winner`, `terminal`, `awaiting_agent`, `opponent`, datas e `version`. `opponent.type=ai` é fixo neste modelo.

| Método | Endpoint | Contrato |
| --- | --- | --- |
| POST | `/games` | `{ "human_color": "white" }` ou `black`; 201, posição inicial padrão, sem movimento automático |
| GET | `/games/{game_id}` | Estado privado reconstruído; 200 |
| POST | `/games/{game_id}/moves` | `{ "move": "e2e4", "version": 0, "client_move_id": "UUID" }`; 200 com estado atualizado |

Todas exigem sessão. ID inexistente ou de outra conta retorna o mesmo `404 game_not_found`. Campos extras como proprietário/FEN são recusados (422). Movimento ilegal: `422 invalid_move`; revisão antiga: `409 stale_game_version`; fim: `409 game_finished`; turno do agente: `409 not_human_turn`; chave reutilizada com payload diferente: `409 duplicate_request`. Erros usam `{code,message}`, sem detalhes internos; respostas têm `Cache-Control: no-store`.

`BEGIN IMMEDIATE`, revisão condicional e gravação da resposta de idempotência na mesma transação impedem estados concorrentes incompatíveis. O cliente deve conservar `client_move_id` **e o mesmo payload** para retry da mesma intenção. Retry aceito devolve a resposta original, mesmo com revisão antiga; para o estado mais recente use GET. Intenção nova precisa de nova chave. Rejeições não gravam chave nem mudam Game. SQL é parametrizado. O lock de escrita é compartilhado com operações de progresso no mesmo arquivo; não há coordenação distribuída.

Depois do lance humano, `awaiting_agent=true` significa apenas que o adversário deverá jogar. Humano de pretas começa nessa condição com histórico vazio. **O agente ainda não faz movimentos**: não há chamada automática Stockfish/LLM, bot aleatório ou policy implementada. O pequeno `AgentPolicy` recebe tabuleiro reconstruído, movimentos legais e configuração, retornando um candidato UCI para revalidação futura pelo servidor. A etapa 6 deverá implementar execução/revalidação/persistência do agente.

Frontend acrescenta somente `api.createGame`, `api.getGame`, `api.submitHumanMove` e tipos/erro operacional; reutiliza credenciais e evento de 401 existentes. A arena manual continua independente. Não existem listagem/reset de Games, PGN, multiplayer, matchmaking ou ranking.

Validação da etapa 5 (05/10/2026): frontend **220 testes em 34 arquivos**, build/typecheck aprovado; backend offline **774 aprovados / 60 LLM não selecionados**, nenhum skip/falha. Baseline anterior: 215 frontend / 726 backend. Novos testes de Game usam bancos temporários, sessões reais e concorrência de conexões; nenhuma chamada real de agente/LLM foi feita. `git diff --check` aprovado. Resultados detalhados no adendo da auditoria.

### Adversário funcional — etapa 6

Na área da partida, selecione **Jogar contra IA**, escolha **Seu lado** e clique **Iniciar partida contra IA**. Brancas fazem o primeiro lance; para humano de pretas, a IA joga antes de a criação retornar. Mova por clique/arraste e escolha dama, torre, bispo ou cavalo ao promover. O tabuleiro espera o estado oficial após cada intenção, mostra xeque/resultado, bloqueia entrada durante espera e permite **Nova partida contra IA**. **Voltar à partida manual** conserva a arena pedagógica e seu histórico. Tutor continua acessível; posições anexadas usam a Game enquanto o modo IA está ativo. Demonstração/prática retornam à arena manual. A partida contra IA exibe histórico UCI; replay/desfazer permanecem exclusivos do modo manual.

Game guarda estado oficial e proprietário; Agent é a identidade/configuração do adversário; Policy escolhe um candidato; Engine é a ferramenta de cálculo. O identificador legado `stockfish` permanece por compatibilidade, mas `AgentPolicy` e `Opponent` separam identidade e mecanismo. A policy concreta atual é StockfishPolicy, sem personalidade/níveis. Ela recebe cópia do tabuleiro com histórico completo, lista legal e configuração; chama `chess_engine.escolher_lance` e não escreve no banco. O servidor reconstrói/revalida o candidato antes de persistir.

POST /games e POST /games/{id}/moves agora executam o turno da IA quando necessário. A resposta Game recebe campos aditivos `human_move`, `agent_move`, `agent_status` e `error`. Rejeição do humano continua erro HTTP tipado. Depois de um lance humano aceito, falha do agente retorna 200 com Game preservada, `agent_status=error`, `awaiting_agent=true` e código `agent_unavailable`, `agent_timeout` ou `invalid_agent_move`, sem movimento inventado. GET retorna estado oficial sem metadados da última operação.

**POST /games/{id}/agent-move**, com somente `{version}`, retoma um turno pendente; exige sessão/proprietário, revisão atual, partida ativa e turno do agente. Não aceita lance do cliente. A UI oferece **Tentar novamente o turno da IA**. Falhas de transporte recarregam a Game e preservam a intenção/chave para confirmação segura. Retry do mesmo lance humano conserva a resposta original, inclusive quando a IA falhou: retomada usa a rota própria.

Transação curta persiste o humano e a chave; cálculo ocorre sem conexão/lock SQLite aberto; nova transação recarrega a revisão, revalida e aplica o agente via atualização condicional. Execuções concorrentes podem calcular mais de um candidato, mas persistem no máximo um lance para a revisão. Candidato obsoleto é descartado e retorna estado atual. A resposta final da intenção é gravada de forma coordenada; crash antes disso deixa o acknowledgement intermediário recuperável, sem duplicação de lance. Não há fila, lock distribuído, cancelamento de requests nem limitação global de processos nesta etapa.

Stockfish usa descoberta/configuração existentes. Decisão usa STOCKFISH_TEMPO (padrão 1 s, intervalo positivo até 10 s), timeout de protocolo de 5 s somado ao limite de busca, inicialização UCI existente e quit/close em finally. Não requer chave de linguagem, RAG ou embeddings; para iniciar sem aquecimento documental, use AQUECER_NA_INICIALIZACAO=false. Não há fallback aleatório, PGN, multiplayer, personalidades ou níveis. Listagem/retomada após reload pela interface, limites globais de custo/concorrência e retenção de Games/chaves continuam pendentes. As seções das etapas 4/5 acima são registros históricos superados neste escopo pela etapa 6.

Validação final da etapa 6 (05/10/2026): **234 testes frontend em 35 arquivos**, build/typecheck aprovado; **819 backend não-LLM aprovados / 60 LLM não selecionados**, nenhum skip/falha (baseline 220/774). Testes incluem policies defeituosas, concorrência/idempotência, promoções, terminais, sequência completa até mate com policy controlada e movimentos reais Stockfish. Script funcional adicional executou duas respostas reais da IA para cada cor com contas/bancos temporários, removidos ao terminar. Handshake confirmou Stockfish 19 e fechamento. Sem LLM pago, FIDE, ingestão, banco real alterado ou navegador integrado. Houve dois timeouts intermediários frontend; rodada focada e completa final passaram sem relaxar limites. Detalhes no adendo da auditoria. `git diff --check` aprovado; nenhuma etapa 7 iniciada.

### Agentes configuráveis — etapa 7

Em **Jogar contra IA**, escolha **Adversário** e **Seu lado** antes de criar a partida. O perfil retornado pela Game fica visível; mudar a seleção prepara uma nova partida e não altera a atual. O catálogo vem de **GET /agents**, autenticado, com somente id, nome, descrição, dificuldade e estilo. Falha/catálogo inválido bloqueia criação e permite recarregar. **POST /games** aceita `agent_id` permitido além de `human_color`; parâmetros arbitrários de motor são recusados.

| ID | Nome | Dificuldade | Estilo |
| --- | --- | --- | --- |
| training_beginner | Treino inicial | Iniciante | Equilibrado |
| balanced | Equilibrado | Intermediário | Equilibrado |
| aggressive | Agressivo | Intermediário | Agressivo |
| positional | Posicional | Avançado | Posicional |
| tactical | Tático | Avançado | Tático |

`AgentProfile` é configuração estática v1, separada de `Difficulty`, estilo, policy e engine. Game persiste `agent_id` e `profile_version`; migração aditiva atribui versão 1 a Games anteriores e aceita acknowledgements antigos. As definições v1 devem ser preservadas; futuras mudanças de configuração precisam de outra versão e resolução correspondente. O ID legado/default da API `stockfish` permanece armazenado como tal e resolve o perfil `balanced` v1. Compatibilidade preserva histórico/retry/legalidade; não promete repetir decisões ou força da antiga busca `play`. A interface escolhe `balanced` explicitamente.

StockfishPolicy usa `SimpleEngine.analyse(..., multipv=...)` do python-chess, sem parsing de texto, LLM ou RAG. Cada candidato contém UCI, CP **ou** mate, PV legal de até oito plies, ranking do motor e perspectiva **side_to_move** (positivo favorece quem está jogando). A análise pedagógica continua com sua perspectiva branca; são contratos distintos. Candidatos ilegais, sem score ou duplicados são descartados. Sem candidato válido há falha recuperável, sem lance inventado.

| Dificuldade | Tempo máximo de busca | Nós máximos | Candidatos máximos | Perda permitida em CP |
| --- | --- | --- | --- | --- |
| Iniciante | 0,15 s | 4.000 | 5 | 150 |
| Intermediário | 0,35 s | 15.000 | 4 | 75 |
| Avançado | 0,70 s | 50.000 | 4 | 25 |

A busca termina pelo limite de tempo ou nós atingido primeiro. Orçamentos são internos ao perfil; `STOCKFISH_TEMPO` continua nos serviços anteriores de análise/decisão, mas não controla os novos perfis. Janela compara avaliação do candidato com a melhor avaliação, em centésimos de peão: 25/75/150 CP representam 0,25/0,75/1,5 peão na escala do motor. Os limites foram verificados em testes controlados e os três orçamentos aceitos pelo Stockfish real; são escolhas conservadoras v1, **sem calibração Elo ou garantia de desempenho contra humanos**. Busca curta pode deixar passar táticas.

Equilibrado respeita ranking após filtro; Treino inicial escolhe a segunda alternativa dentro da janela quando disponível, sem aleatoriedade. Agressivo favorece xeques, capturas, pressão geométrica, centro e desenvolvimento. Posicional favorece roque, desenvolvimento, centro e defesa, penalizando exposição e peões dobrados. Tático favorece xeques/capturas e ações forçantes do próprio lado na PV. Empates de heurística usam ranking e UCI. Estilo só atua dentro da janela; são heurísticas locais, sem imitação fiel de Magnus, Hans ou outro jogador. Identidades visuais existentes permanecem.

Mate não vira CP: se houver mate vencedor anunciado, só mates mais rápidos ficam elegíveis; sem ele, candidatos sem mate perdedor precedem os perdedores; se todos anunciam derrota, prefere maior distância até mate. Essa regra vale para todos os níveis. Um único movimento legal dispensa engine. A proteção depende do que o motor encontrou no conjunto limitado; não certifica ausência de mate além do horizonte.

Servidor continua revalidando o candidato na reconstrução oficial e novamente sob revisão/transação antes de persistir. Propriedade, turno, término, idempotência, concorrência e retry da etapa 6 são preservados. Falha após lance humano mantém esse lance e permite retomar o agente. A geração usa no máximo **dois processos simultâneos por worker**, espera vaga por até 1 s e falha recuperável se ocupado; busca tem timeout de protocolo de 5 s somado ao orçamento e inicialização UCI existente. `quit/close` e liberação da vaga ocorrem em `finally`. Limite não cobre outros serviços de análise nem é distribuído entre workers; rate limit global/cancelamento continuam pendentes. Não houve upgrade, scraping, treinamento ou alteração de corpus. Resultados e limites da validação estão no adendo da auditoria.

Validação final da etapa 7: **239 testes frontend em 35 arquivos**, build/typecheck aprovado; **866 backend aprovados/60 LLM não selecionados**, nenhum skip/falha (+5/+47 frente à etapa 6). O conjunto novo confirmou MultiPV real com cinco/quatro/quatro candidatos e processos encerrados, mates, seleção controlada, migração/retry/concorrência. Script funcional com bancos temporários confirmou dois turnos completos contra balanced/aggressive, humano preto contra positional e retry com Stockfish real após timeout simulado. Stockfish 19 confirmado. Primeira execução simultânea teve três timeouts frontend; completa isolada passou sem mudar limites. Sem browser integrado ou calibração Elo. `git diff --check` aprovado; sem commit/deploy ou etapa seguinte.

### Continuidade de partidas — etapa 8

Na área **Jogar contra IA**, **Suas partidas** lista as Games da sessão. Use **Continuar partida** para uma ativa (`terminal=false`) ou **Ver resultado** para uma encerrada. A mais recentemente atualizada aparece primeiro; múltiplas ativas exigem escolha explícita. Filtros Todas/Em andamento/Encerradas e paginação estão disponíveis. **Atualizar partidas** permite recuperar falhas de listagem.

Após reload ou fechar/reabrir a interface, entre novamente se necessário, abra **Jogar contra IA** e escolha a partida. A aplicação consulta a lista e depois **GET /games/{id}**: FEN, movimentos, cor humana, turno, resultado e perfil vêm do servidor. Nenhuma Game é criada automaticamente na montagem, e nenhum estado/ID de Game é lido ou gravado em localStorage. Seleção de adversário/lado configura a próxima criação, sem substituir os dados de uma retomada. Metadados do perfil são resolvidos no servidor por `agent_id/profile_version`, com compatibilidade para `stockfish` v1.

Game pendente da IA bloqueia o humano e oferece **Tentar novamente o turno da IA**, usando agent-move existente. Retomar por GET não executa agente automaticamente. Game terminal exibe posição final/resultado, bloqueia movimentos e permite nova partida. Modo manual/tutor permanecem acessíveis.

**GET /games** exige sessão e só lista o proprietário autenticado. Resposta: `{games,next_offset}`, com resumos (id, cor, opponent/perfil, datas, status/vencedor/terminal, turno, awaiting_agent, quantidade de plies e revisão), sem proprietário, FEN ou histórico completo. Ordenação `updated_at DESC, id DESC`; `status=all|active|finished`, `limit=1..50` (padrão 20), `offset=0..10000`. Offset conta resultados após filtro. A UI usa páginas de 20. Filtros/limites inválidos retornam 422; outros donos mantêm o mesmo 404 de ID inexistente nas operações individuais.

**POST /games** aceita `client_game_id` UUID opcional. Mesma conta/chave/cor/agent_id retorna a mesma Game em seu estado atual, sem executar novamente o turno inicial da IA. Mesma chave com payload diferente retorna `409 duplicate_request_conflict`; contas diferentes têm namespaces separados. Transação BEGIN IMMEDIATE grava Game e chave atomicamente. Campo omitido preserva clientes antigos e cria recursos distintos. Frontend gera uma chave por intenção, trava duplo clique e conserva chave/payload para **Confirmar criação da partida** após erro ambíguo. Após remontagem, essa intenção em memória se perde; a lista recupera Games já persistidas, sem nova criação automática. Criação repetida pendente requer retry explícito do agente.

Migração aditiva cria índice de ordenação/proprietário e tabela `game_create_requests`; não altera heurísticas, dificuldades, histórico nem dados de contas. Respostas privadas mantêm no-store. Paginação por offset pode mudar sob atualizações concorrentes; filtros precisam reconstruir históricos em streaming, portanto custo não é constante em grandes acervos. Retenção/limpeza de chaves e partidas, limites globais e cancelamento continuam pendentes.

Validação integrada **real em Google Chrome headless local**, via DevTools, com perfil de navegador isolado e conta/bancos temporários: login; balanced/brancas e aggressive/pretas com dois turnos completos; reload, listagem, retomada da mesma Game e novo turno; Game pendente + retry; terminal bloqueada; modo manual e modal tutor. A posição terminal foi inspecionada em captura renderizada. Browser integrado do plugin não estava disponível; o fallback Chrome foi usado. Não houve LLM pago, FIDE, upgrade ou alteração de banco real. As fixtures pendente/terminal foram criadas exclusivamente no ambiente temporário de QA. Resultados automatizados finais estão no adendo da auditoria.

Resultados finais da etapa 8: **247 testes frontend/35 arquivos**, build/typecheck aprovado; **886 backend aprovados/60 LLM não selecionados**, nenhum skip/falha (+8/+20 frente à etapa 7). Sem timeouts frontend nesta rodada. Testes reais confirmaram fechamento/recriação de cliente e continuidade para ambas as cores; testes determinísticos cobrem isolamento, terminal, retry, paginação e criação concorrente/idempotente. Chrome/servidores de QA encerrados e bancos temporários removidos. `git diff --check` aprovado; sem commit/deploy ou etapa seguinte.

### Histórico, PGN e revisão — etapa 9

**initial_fen + movimentos UCI continuam a fonte oficial.** SAN, PGN e posições de replay são derivados no servidor com python-chess, sem novas colunas/tabelas ou importação de PGN. Os registros das etapas anteriores sobre ausência de PGN/replay contra IA ficam superados por esta seção.

Em **Suas partidas**, escolha **Continuar partida** ou **Revisar partida** (encerrada). O painel apresenta SAN, com numeração/cor, e permite clicar em lance, ir ao início, anterior, próximo e fim. Replay é somente leitura, inclusive ao chegar ao último lance; **Voltar à posição atual** é necessário para continuar uma Game ativa. Não altera histórico, revisão, resultado ou turno oficial. O tutor mantém a posição oficial anexada; o replay manual existente permanece separado.

**Exportar PGN** recebe o texto do servidor, mostra uma cópia somente leitura e inicia download com nome fixo `partida.pgn`. Headers incluem Event/Site/Date/White/Black/Result e identidade/versão do perfil. Humano é identificado como `Human`, sem e-mail/owner/sessão. Resultados são `*`, `1-0`, `0-1` e `1/2-1/2`, derivados do estado reconstruído; posições iniciais alternativas usam SetUp/FEN do exportador python-chess. Não há importação nem edição de PGN.

| Operação autenticada | Contrato |
| --- | --- |
| GET `/games/{id}/replay` | game_id/version, initial_fen/current_fen, resultado/termination e steps com ply/move_number/color/UCI/SAN/FEN após cada lance |
| GET `/games/{id}/pgn` | `application/x-chess-pgn`, attachment de nome fixo, nosniff |
| POST `/games/{id}/review` | Corpo estrito `{ply,version}`; resposta estruturada com snapshot, lance jogado, avaliações antes/depois, melhor lance/PV e delta CP opcional |

As três operações exigem proprietário da sessão, retornam o mesmo 404 para ID ausente/alheio e usam no-store. Cliente não fornece FEN, PGN, histórico ou identidade. Revisão exige revisão atual (409 se obsoleta) e ply válido (422); `ply=0` analisa a posição inicial, sem lance comparado. Indisponibilidade do motor/vaga retorna 503 recuperável. 401 mantém invalidação de sessão existente.

**Analisar lance selecionado** usa exclusivamente Stockfish/chess_engine, sem LLM/RAG. Antes e depois preservam a pilha oficial de movimentos; terminais são detectados pelo histórico completo e não precisam de motor. Avaliação tem perspectiva explícita **white**: CP positivo favorece brancas, negativo pretas. Mate é campo separado: positivo brancas, negativo pretas; mate terminal é zero com vencedor explícito. Delta é depois menos antes na perspectiva branca, apenas quando ambas as buscas retornam CP. Mate nunca é convertido para CP. Não há classificação de qualidade ou probabilidade de acerto.

Revisão reutiliza a análise existente com cópia do tabuleiro/histórico. São até duas buscas de 0,25 s, PV de até três plies, timeout de protocolo de 5 s, inicialização UCI existente e encerramento em finally. Até duas revisões simultâneas por worker, esperando vaga por até 1 s; esse limite é separado dos candidatos de agentes. Conexão SQLite fecha antes das buscas; resposta continua vinculada a game_id/version/ply se houver escrita concorrente. Frontend descarta respostas de seleção/revisão anterior. Listagem, replay, navegação e exportação não iniciam Stockfish. Busca por tempo pode variar entre execuções; não é benchmark ou classificação de lances.

Validação real: Chrome headless isolado e conta/bancos temporários. Game terminal com quatro lances: início/meio/fim, SAN e exportação `0-1`; revisão real de `Qh4#` mostrou mate das pretas sem delta CP. Game ativa Posicional: e4/e5, replay bloqueado (tentativa sem efeito), retorno explícito e Nf3/Nc6; análise real de e4 apresentou CP/PV; reload preservou sessão/listagem/histórico. Manual/tutor foram abertos sem enviar pergunta real. Capturas desktop 1280×1000 inspecionadas; espaçamento de controles ajustado sem redesign. Browser integrado indisponível; Chrome local foi usado. Sem dado real alterado, upgrade, ingestão ou chamadas LLM/FIDE. Resultados das suítes e timeouts intermediários constam na auditoria.

Limites: sem revisão automática de partida inteira, cache de avaliações, classificação de lances, download validado em mobile/TLS ou cancelamento de trabalho já iniciado. Limites são por worker e não coordenam todos os serviços. Retenção/limpeza, custo de acervos grandes e paginação concorrente da etapa 8 permanecem. Perfis/heurísticas, promoção, retry, autenticação e fluxos pedagógicos foram preservados.

Resultados finais da etapa 9: **260 frontend/36 arquivos**, build/typecheck aprovado; **920 backend aprovados/60 LLM não selecionados**, nenhum skip/falha (+13/+34). Round-trip PGN confirmou sequência UCI e FEN final em posições clássicas e alternativas. Primeira suíte frontend e reexecuções intermediárias tiveram timeout5s no teste IA/tutor; espera de atualizações React foi ajustada sem aumentar limite, e a completa final passou. Chrome/API/Vite encerrados, bancos/perfil de QA removidos; `git diff --check` aprovado. Sem commit/deploy ou próxima etapa.

### Identidade e persona pedagógica — etapa 10

A seleção distingue **Perfis de treino** (Treino inicial, Equilibrado, Agressivo, Posicional e Tático) e **Perfis inspirados**. Os três novos nomes são perfis educacionais: interpretações heurísticas do projeto, sem imitação fiel, treinamento em partidas, identidade/opiniões reais ou endosso. As associações abaixo são decisões criativas de produto.

| ID | Nome de apresentação | Dificuldade / estilo | Persona v1 |
| --- | --- | --- | --- |
| magnus_inspired | Perfil inspirado em Magnus | Avançado / posicional | structure: analítico, estrutura e desenvolvimento |
| hans_inspired | Perfil inspirado em Hans | Avançado / agressivo | initiative: direto, iniciativa e respostas concretas |
| judit_inspired | Perfil inspirado em Judit | Avançado / tático | threats: energético, ameaças concretas |

**Engine calcula; Difficulty limita busca; Style prioriza candidatos elegíveis; Policy escolhe; servidor revalida/persiste; Persona apresenta.** Os cinco perfis antigos conservam suas configurações de jogo. Inspirados reutilizam advanced v1 (0,70 s/50 mil nós/quatro candidatos/janela25 CP) e a policy existente. Não foi alterado chess_engine/agent_policy, nem recalibrada força. Nenhuma persona escolhe UCI, valida legalidade ou altera Game.

AgentProfile acrescenta persona_id/persona_version/inspiration. `profile_version=1` persistido resolve a definição estática que fixa persona v1: nenhuma coluna/migração nova. Definições v1 devem continuar imutáveis; evolução exige novas versões e resolver correspondente. Games antigas e alias stockfish→balanced continuam compatíveis, com persona didática training v1 como apresentação padrão. GET /agents expõe versões, indicação inspirada e metadados seguros (id/version/tom/foco), sem pergunta interna/prompt/caminho/orçamento. Metadados de persona indisponíveis tornam-se null, sem impedir jogo.

**Comentário pós-lance implementado localmente, sem LLM.** Após receber Game oficial, frontend consulta GET `/games/{id}/commentary?version=V&ply=P`. Rota só de leitura exige sessão/proprietário, revisão atual e lance da IA já persistido; versão obsoleta409, ply inválido/humano422, persona desconhecida503. Retorna snapshot/versões, SAN/UCI/fatos e texto/status. Não é parte da transação/acknowledgement de movimento; comentário não causa retry do lance. Ao retomar Game, mesma combinação snapshot/ply/persona produz texto estável, sem cache ou chamadas pagas.

Persona recebe somente dataclasses frozen com SAN/UCI/captura/xeque/roque/promoção/término/vencedor. Templates apresentam esses fatos e perguntas pedagógicas; não atribuem citações ao jogador nem afirmam ganho/best move/ameaça de mate sem evidência. Não fazem nova busca Stockfish. Não incluem avaliação/PV ou fontes: a revisão da etapa9 mantém perspectiva white e mate separado de CP. Falha/TimeoutError/saída inválida de template produz fallback `Lance oficial: SAN.`. Falha de rede/persona é neutra no cliente, sem bloquear Board. Templates atuais são finitos e sem I/O; não foi criado cancelamento de código arbitrário pesado.

O painel exibe o último comentário de lance da IA, identificado pelo número do lance, inclusive se o tabuleiro estiver em outro ply de replay; é metadata da Game, não análise do snapshot visual. Respostas antigas de outra Game/revisão são descartadas. A seleção prepara a próxima Game e não substitui identidade atual. PGN mantém nome seguro “Perfil inspirado em…” e acrescenta PersonaId/PersonaVersion quando disponíveis. SAN/UCI/FEN/resultados/replay permanecem derivados da fonte oficial.

Autorização/anti-enumeração/no-store/SQL parametrizado/idempotência/retry/limites MultiPV anteriores preservados. Cliente continua escolhendo só IDs permitidos; prompts, pesos, caminho/nós/depth/persona_version arbitrários em POST /games são recusados. Sem scraping, bases externas, treinamento, upgrades, novos assets ou uso de dados Masters como treinamento.

Validação real em Chrome headless isolado, com conta/bancos temporários e Stockfish real: catálogo5+3; Magnus/brancas dois turnos e comentário analítico; Hans/pretas abre automaticamente e dois turnos com comentário direto; Judit/brancas dois turnos, reload/retomada mesma identidade/persona; replay e exportação com nome inspirado seguro; manual/tutor disponíveis sem enviar pergunta. Captura desktop1280×1000 inspecionada. O navegador integrado estava indisponível; Chrome local foi utilizado. Bancos/perfil/servidores temporários encerrados/removidos; nenhum dado real ou API paga utilizado. Resultados finais e limites estão no adendo da auditoria.

Resultados finais da etapa10: **270 frontend/37 arquivos**, build/typecheck aprovado; **959 backend aprovados/60 LLM não selecionados**, nenhum skip/falha (+10/+39). Nenhum timeout frontend observado, sem alterar prazos. Genéricos, duas cores, retry/promoção/terminal, continuidade/idempotência, SAN/PGN round-trip/replay/revisão/propriedade preservados na regressão. Handshake final confirmou **Stockfish19**; diff check aprovado,16 arquivos revisados. LLM não usado nem necessário para jogo/persona; tutor documental mantém dependências anteriores. Sem commit/deploy ou etapa11.

## Benchmark offline de estilos — etapa 11

Em `backend`, com a venv existente e Stockfish local:

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 ANTHROPIC_API_KEY='' OPENAI_API_KEY='' AQUECER_NA_INICIALIZACAO=false PYTHONDONTWRITEBYTECODE=1 ../.venv/bin/python -m benchmarks.agent_styles
```

Opcional: acrescente `--json /tmp/agent-styles.json` para traces estruturados. O comando não usa rede/LLM, não cria Game nem acessa banco e não tem endpoint público. Mede implementação, diferenciação interna, qualidade relativa aos candidatos e invariantes; não mede Elo, fidelidade histórica, personalidade ou semelhança estatística com jogadores reais.

Dataset v1: 16 entradas, 15 categorias e 15 FENs distintos, criados no projeto (`synthetic/project-test`), com ID/FEN/categoria/descrição/origem em `backend/benchmarks/positions.py`. A oportunidade de captura da dama também é usada como controle de qualidade; sua repetição pondera esse caso duas vezes. Categorias: abertura/desenvolvimento, centro, fechada, aberta, ataque ao rei, captura, xeque, tática, posicional, alternativas aproximadamente equivalentes, final, lance único, mate vencedor (duas cores), qualidade e mate perdido. A descrição de alternativas é intenção do caso; elegibilidade é medida pelo motor.

`DecisionTrace` interno/frozen registra perfil/versão/dificuldade/estilo, candidato escolhido e melhor avaliação encontrada, ranks/scores/PVs, elegibilidade, features/pontuação de estilo, motivo de seleção, perda CP e classificação de mate. Não é persistido nem exposto na API. `trace_move` reutiliza gerador e seletor de produção; as decisões sem/com trace são testadas com os mesmos candidatos. Persona não participa.

Perspectiva `side_to_move`: CP positivo favorece quem decide, também quando são pretas. Perda CP = melhor CP dos candidatos válidos menos CP escolhido, não negativa. Mate não recebe CP fictício: há categorias de mate vencedor preservado/mais lento/perdido, mate perdedor e lance único sem avaliação. A política mantém o mate vencedor mais curto encontrado e adia o mate perdedor quando todos os candidatos perdem. Isso não garante encontrar todos os mates fora do horizonte.

O benchmark usa **somente nós**, Threads=1/Hash=16 MiB e processo novo por busca. Reutiliza os limites internos de candidatos, semáforo, timeout de protocolo e fechamento; partidas mantêm tempo E nós. Os três budgets v1 conservam 4000/15000/50000 nós, 5/4/4 candidatos e janelas 150/75/25 CP. Cada dificuldade gera candidatos uma vez por posição, compartilhados pelos perfis correspondentes. Outra comparação fixa todos os estilos no mesmo orçamento/janela advanced, separando estilo e dificuldade. Não há RNG; reproduzir resultados numéricos requer mesma versão/binário/opções do motor e bibliotecas. Busca limitada em produção pode variar.

Execução local Stockfish **19**: **16 posições × 8 perfis**, 45 buscas + 1 handshake, sequencial, **10,59 s**. Repetição produziu traces idênticos nesta máquina; duração anterior 11,99 s. Não é garantia entre versões/plataformas. Todos os selecionados eram legais/elegíveis e respeitaram as janelas; cada perfil preservou três mates vencedores, uma posição de mate perdedor e um lance único. Médias CP abaixo usam somente 11 casos CP por perfil. Rank 1 inclui o lance único, convencionado como rank 1 sem avaliação do motor.

| Perfil | Posições | Rank 1 | Rank médio | Perda CP média / mediana / máxima | Divergência vs balanced |
| --- | --- | --- | --- | --- | --- |
| training_beginner | 16 | 8 | 1.50 | 5.00 / 2 / 15 | 6 |
| balanced | 16 | 16 | 1.00 | 0.00 / 0 / 0 | 0 |
| aggressive | 16 | 11 | 1.56 | 3.09 / 0 / 16 | 5 |
| positional | 16 | 11 | 1.44 | 3.27 / 0 / 14 | 5 |
| tactical | 16 | 15 | 1.12 | 0.73 / 0 / 8 | 3 |
| magnus_inspired | 16 | 11 | 1.44 | 3.27 / 0 / 14 | 5 |
| hans_inspired | 16 | 12 | 1.38 | 2.73 / 0 / 9 | 5 |
| judit_inspired | 16 | 15 | 1.12 | 0.73 / 0 / 8 | 3 |

Com candidatos advanced iguais: aggressive/positional/tactical diferiram do balanced em **4/5/1** posições; oito tinham alternativas elegíveis. Houve empate de pontuação de estilo em **2/2/4** dessas oito. No mesmo conjunto, balanced/aggressive/positional/tactical escolheram **4/5/3/5 capturas**, **2/1/5/1 desenvolvimentos**, **5/8/5/6 destinos centrais** e **20/16/16/21 ações forçantes próprias ponderadas na PV**. São contagens definidas, não percentuais de agressividade. Nenhum roque foi escolhido: este recorte não valida preferência por roque ou segurança global do rei. Defesa/exposição são somente ataques geométricos à casa de destino.

**Calibração: NENHUMA.** Há diferenciação observada e nenhuma violação de janela/mate. A divergência tática pequena exige amostra maior antes de alterar pesos. Magnus/Judit inspirados coincidiram com positional/tactical nos mesmos budgets; Hans inspirado difere de aggressive em uma posição pelo orçamento advanced/intermediate. Comparação exclusivamente interna.

Regressão final etapa 11: **270 frontend/37 arquivos**, build/typecheck aprovado; **1006 backend aprovados/60 LLM não selecionados**, nenhum skip/falha. Chrome headless isolado confirmou duas cores/dois turnos, reload/retomada, persona, replay e PGN; sem conta/banco real. Detalhes e limites no adendo da auditoria. Sem commit/deploy ou etapa 12.

## Rating e progressão interna — etapa 12

O rating do **Xadrez Multiagente** é uma pontuação interna de progressão, calculada exclusivamente pelo backend a partir de Games oficiais encerradas contra IA. **Não corresponde a rating FIDE, Elo real ou força calibrada dos jogadores/perfis.** Não usa avaliação Stockfish, persona, LLM, análise, exercícios ou lances isolados como pontuação.

Versão 1: inicial **1200**, **K=32**, expectativa `E=1/(1+10^((oponente-jogador)/400))`; novo rating `round(jogador+32*(S-E))`, com S=1/0,5/0 para vitória/empate/derrota. `round` do Python arredonda ao inteiro mais próximo, com empate para o inteiro par. Empate pode aumentar, reduzir ou manter o rating; delta zero é exibido.

| Dificuldade persistida do perfil | Rating interno v1 |
| --- | --- |
| beginner | 1000 |
| intermediate | 1200 |
| advanced | 1400 |

Magnus/Hans/Judit inspirados usam advanced=1400; o alias stockfish resolve balanced/intermediate=1200. São parâmetros do produto, sem relação com os ratings FIDE dos jogadores retratados em Masters. Definições v1 devem permanecer disponíveis; versões novas exigem implementação correspondente.

Migração aditiva cria `player_ratings` e `rating_events` no SQLite de progresso. Evento único por `game_id` registra antes/depois/delta, resultado/score, perfil/versão, rating do oponente, versão do sistema e data UTC. Conta vem da sessão e não é exposta. Encerramento oficial, evento e atualização do jogador usam a mesma transação `BEGIN IMMEDIATE`: falha reverte esse commit; concorrentes da mesma Game não duplicam, Games distintas da mesma conta não perdem atualizações. Motor roda fora da transação como antes.

GET `/rating` inicializa a conta em 1200 quando necessário e lê sua pontuação. GET `/rating/history` lê apenas seus eventos, com limit padrão10 (1–50), offset0–10000 e ordem decrescente por data/ID. GETs, replay, PGN, análise, revisão, comentários, criação e partidas ativas não aplicam rating. `Game.rating_change` contém somente o evento persistido, ou null.

POST `/games/{id}/rating`, corpo `{version}`, reconcilia um terminal sem evento de forma idempotente; exige sessão/propriedade/revisão, sem aceitar resultado/rating do cliente. Partidas antigas não são recalculadas automaticamente: podem ser reconciliadas explicitamente. Perfil/versão legado desconhecido permanece legível e sem pontuação inventada. O cálculo segue a ordem de aplicação dos eventos, inclusive reconciliações antigas, sem reordenar retroativamente a trajetória.

Após login, o painel consulta rating e cinco eventos recentes; ao encerrar/retomar terminal, atualiza a leitura. Resultado mostra delta real e rating histórico daquela partida; o painel mostra o rating corrente. Falhas permitem tentar novamente, respostas atrasadas são descartadas e 401 conserva o fluxo de sessão expirada existente. Sem pontuação em localStorage.

Validação etapa12: **1043 backend aprovados/60 LLM não selecionados**, **282 frontend aprovados/39 arquivos e build/typecheck aprovado** (JS435,37kB/gzip135,06; CSS84,71kB/gzip25,55). Chrome isolado confirmou 1200 →1216 (vitória), →1199 (derrota), →1207 (empate contra Hans inspirado), três eventos e persistência após reload. Bancos/contas exclusivamente temporários; nenhum dado real modificado. Benchmark Stockfish19 preservado: 16 posições/8 perfis/45 buscas,10,10s. Sem commit/deploy/etapa13.
