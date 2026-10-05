# Xadrez Multiagente

## Visão geral

Aplicação de aprendizagem de xadrez em português, com tabuleiro interativo, tutor baseado em documentos, análise de posições com Stockfish, lições e exercícios curados. A interface usa pixel art e chama os lados brancos e pretos de **Magnus** e **Hans**.

**Hoje, a pessoa movimenta os dois lados do tabuleiro.** Magnus e Hans não são jogadores autônomos: seus painéis exibem análises solicitadas pelo usuário. Os papéis de linguagem realmente implementados no backend são Árbitro, Professor, Estrategista, Analista e Roteador.

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
| Documentos | `GET /documentos/{nome}`, `GET /documentos/{nome}/contexto` |
| Administração | `POST /ingest`, protegido por `X-Admin-Token`, desativado sem token configurado |
| Documentação automática | `/docs`, `/redoc`, `/openapi.json` |

Persistência local: SQLite para contas/sessões, progresso/cache de lições e cache de ratings; ChromaDB em disco para documentos. Não existe backend de partidas, comentários ou likes.

**Etapa 2: autorização no backend.** Tutor, recomendações, análise, lições, progresso, exercícios e documentos exigem sessão válida. Health, autenticação, documentação FastAPI e Masters permanecem públicos; `/ingest` exige o segredo administrativo independente. O UUID de progresso é verificado contra a conta autenticada. CORS e limites por IP não substituem autorização.

O cookie `xadrez_session` usa `Path=/`, HttpOnly, SameSite=lax, validade de sete dias e Secure configurável por `AUTH_COOKIE_SECURE`. Logout revoga a sessão SQLite e remove cookies nos paths atual e legado (`/auth`). Cookies antigos exigem novo login para acessar rotas privadas.

Progresso antigo não é apagado nem associado automaticamente a quem informa um UUID. Após verificar localmente quem é o proprietário, execute em `backend`, com a API parada para manutenção:

```bash
../.venv/bin/python associate_progress.py UUID_LEGADO email@exemplo.com
```

A ferramenta exige conta provisionada, recusa substituir proprietário e seleciona esse UUID como progresso padrão da conta. Outros IDs/dados existentes são preservados; não há fusão automática. Sem UUID, rotas de lição/progresso e validação usam a identidade padrão da sessão. O frontend limpa o UUID compartilhado ao restaurar/entrar/sair da sessão e retoma o progresso pelo backend.

## Inteligência artificial e xadrez

- **Stockfish/python-chess:** serviço reutilizável em `backend/chess_engine.py` valida FEN, calcula avaliação/melhor lance/PV e valida/aplica candidatos UCI, sem importar LLM, RAG ou embeddings. Não executa jogadas automaticamente na partida.
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

FEN isolado não preserva repetição; scores de busca limitada por tempo podem variar entre execuções. Não há MultiPV, policy, loop ou endpoints de partida contra IA. Uma etapa futura poderá usar `analisar_posicao` → candidato UCI → `movimento_legal` → `aplicar_movimento`, com propriedade da partida na camada de aplicação.

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

Use Python 3.11 e Node 24 para os comandos abaixo. O Vite instalado aceita Node `^20.19.0 || >=22.12.0`, mas o Vitest instalado exige `^22.12.0 || ^24.0.0 || >=26.0.0`; o script de prévia também executa TypeScript diretamente com Node. Instale Stockfish separadamente e configure um provedor de linguagem.

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

Continuam incompletos: jogo autônomo Magnus × Hans, cadastro público, armazenamento de partidas/chat, comentários/likes persistentes, página completa de curiosidades e avaliação ampliada do RAG. A etapa 2 resolveu a autorização das rotas privadas, a propriedade do progresso e a reação da interface a 401. A etapa 3 preserva fatos de análise diante de falhas LLM/RAG. Permanecem pendentes limites de taxa/concorrência dos exercícios, cancelamento de threads, regras de empate/promoção e demais itens indicados no adendo de [PROJECT_AUDIT.md](PROJECT_AUDIT.md).

## Licença e créditos

[GPL-3.0](LICENSE). O projeto usa `python-chess`; Stockfish é instalado separadamente e não distribuído neste repositório. Documentos de terceiros têm licenças próprias. Inter e Pixelify Sans têm arquivos OFL em `frontend/public/fonts/`; Press Start 2P vem de `@fontsource`. A documentação histórica registra o uso de Claude/Claude Code no desenvolvimento, sem que esta auditoria valide a autoria individual dos assets.
