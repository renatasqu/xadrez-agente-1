# Backend V1

Esta entrega integra o backend existente sem novos agentes, modelos, banco ou pipelines.

## Auditoria e arquitetura final

Continuam necessários os contratos Pydantic, o roteador, os guardrails de entrada/saída,
o juiz, as demonstrações curadas, o Analista/Stockfish, os exercícios e o SQLite.
É redundante buscar vetorialmente uma referência de regra já conhecida ou pedir ao LLM
IDs de prática. Ingestão, glossário, embeddings, ChromaDB e fallback entre índices ficam
preservados para conteúdo aberto e compatibilidade. Não houve reingestão.

| Camada | Responsabilidade |
| --- | --- |
| 1 — Xadrez determinístico | python-chess valida FEN/lances e calcula fatos locais; Stockfish fornece avaliação e linha legal. |
| 2 — Pedagogia | `conceitos.py`, catálogo A1/A2/A3/E1, validadores puros e progresso SQLite. |
| 3 — Documentos e linguagem | Mapa FIDE curado, RAG para conteúdo aberto, LLM para explicar e juiz para verificar fundamentação. |
| 4 — Produto | Lições, chat, análise e API; experiências Aprender, Perguntar e Analisar compartilham as camadas. |

O LLM não decide legalidade. RAG não valida exercícios. `exercises` não importa LLM/RAG
nem Stockfish; o adaptador HTTP recebe da aplicação um callback opcional de persistência.
Stockfish não fornece explicação causal: a explicação continua documental e separada dos
números do motor. `related_exercise_ids` são associações curadas, nunca geração de posições
ou garantia de que um exercício reproduz o tabuleiro do usuário.

## Catálogo de conceitos

O catálogo Python versionado contém `exercise_ids`, `demonstration_key`, `lesson_id` e
`source_reference`. `LICAO_CONCEITOS` é a associação explícita de lições, inclusive quando
uma lição cobre vários conceitos. Não há escolha de IDs pelo LLM.

| Conceito | Exercícios reais | Lição | Demonstração | FIDE 2023 |
| --- | --- | --- | --- | --- |
| movimento_cavalo | a1-cavalo (A1) | 1 | cavalo | 3.6 |
| roque | a2-roque-pequeno, a2-roque-grande, a2-roque-bloqueado (A2) | 2 | roque | 3.8.2–3.8.2.2 |
| garfo | a3-garfo-cavalo (A3) | 8 | — | — |
| evitar_perda_material | e1-material-seguro (E1) | — | — | — |
| desenvolvimento | — | 6 | — | — |
| controle_centro | — | 6 | — | — |
| valor_pecas | — | — | — | — |
| xeque | — | 4 | xeque | 3.9.1–3.9.2 |
| mate | — | 4 e 11 | xeque_mate | 5.1.1 |
| en_passant | — | 3 | en_passant | 3.7.3.1–3.7.3.2 |
| promocao | — | — | promocao | 3.7.3.3–3.7.3.5 |
| afogamento | — | 4 | afogamento | 5.2.1 |
| movimento_pecas | — | 1, junto de movimento_cavalo | — | 3.1–3.8 |

Referências conferidas no [FIDE Handbook, versão em vigor desde 2023](https://handbook.fide.com/chapter/E012023).
`regras_curadas.py` mantém resumos em português identificados como resumos, sem apresentá-los
como transcrição literal do PDF. A cobertura determinística é conservadora: perguntas básicas
como “Como funciona o roque?” e “O que é en passant?”, além da primeira lição controlada.
Perguntas abertas, exceções ou formulações não cobertas continuam no RAG.

## Integração das experiências

**Aprender:** primeira lição → movimento_pecas/movimento_cavalo → A1; lição 2 → roque → A2;
lição 8 → garfo → A3. Lições 3, 4, 6 e 11 têm conceitos sem exercício adicional. O conteúdo
continua passando pelo agente, juiz e saída. Caches antigos são enriquecidos ao ler, sem
invalidação destrutiva. Entregar uma lição avança somente o progresso de leitura.

**Perguntar:** após segurança e categoria resolvida, o reconhecimento determinístico associa
conceitos. Perguntas sobre movimento do cavalo recebem A1; roque, A2; garfo na categoria de
estratégia, A3. Uma pergunta de abertura que apenas menciona cavalo não recebe A1. Recusas,
erros e respostas rejeitadas pelo juiz mantêm listas vazias. O LLM nunca recebe autoridade
para definir `concept_ids` ou `related_exercise_ids`.

A localização de referências conhecidas acontece na entrada comum `retrieval.buscar`, antes
de embeddings/ChromaDB. O agente ainda recebe os resumos como dados, explica e cita a fonte.
Assim permanecem o contrato de fundamentação, o juiz e o fallback já existentes. Resumos
curados não geram `onde_ler` com IDs fictícios de chunks navegáveis. `/recomendar` retorna a
referência conhecida e dispensa buscas nos demais livros nesse caso.

**Analisar:** preserva o Analista existente. Recomenda A3 somente quando o melhor lance legal
é de cavalo e seus ataques formam um garfo sobre pelo menos duas peças adversárias não peões.
Recomenda E1 quando há peça própria não peão, desprotegida, sob captura adversária legal,
num diagnóstico local conservador, em posição válida sem xeque. Isso identifica peça em
tomada, sem afirmar perda forçada ou analisar sacrifícios. Posições incertas, xeque e ameaças
com defensores não recebem E1 por essa regra. Texto do LLM e avaliação em centipeões não
servem como evidência para a associação. Não há geração dinâmica de exercícios ou novo PGN.

## Progresso e contratos

Contratos existentes recebem campos opcionais com `default_factory=list`:

- `Resposta` (chat/análise/conteúdo de lição): `concept_ids`, `related_exercise_ids`.
- `RespostaLicao`: os mesmos campos no envelope, além de `conteudo`.
- `InfoLicao` e `ValidationResult` preservam seus contratos existentes.

| Endpoint | Contrato V1 |
| --- | --- |
| POST /chat | EntradaChat → Resposta, com associações curadas quando aplicáveis. |
| POST /analisar | EntradaAnalise → Resposta, com prática por fatos locais. |
| POST /recomendar | EntradaRecomendacao → Resposta; referências conhecidas ou onde_ler documental. |
| POST /licao/proxima | EntradaLicao → RespostaLicao; pode criar UUID anônimo. |
| GET /licao/atual?usuario_id=UUID | RespostaLicao; consulta sem avançar. |
| GET /exercises/{exercise_id} | Exercise; nenhuma tentativa/conclusão. |
| POST /exercises/{exercise_id}/validate?usuario_id=UUID | ValidationRequest → ValidationResult; query UUID opcional ativa persistência. |
| GET /progresso/exercicios?usuario_id=UUID | Lista de ProgressoExercicio; UUID obrigatório, leitura sem mutação. |

A aplicação instala `app.state.exercise_recorder`; a API de exercícios chama esse adaptador
somente depois de um resultado válido. Sem UUID, o comportamento anterior permanece stateless.
O router isolado sem adaptador rejeita pedidos de persistência com `invalid_request`, sem
alterar a função pura `validate`. O cliente pode reutilizar o UUID das lições ou gerar UUID
anônimo próprio. UUID não é autenticação.

`progresso_exercicios`, no mesmo SQLite, tem chave `(usuario_id, exercise_id)` e os campos
`concept_id`, `status` (`in_progress`/`completed`), `attempts` e `updated_at` UTC. Cada ação
com ValidationResult, inclusive `partial`, conta uma tentativa. `incorrect` não conclui;
`correct` conclui; tentativas posteriores não desfazem a conclusão. Erros de protocolo,
GETs e leitura de lição não contam. UPSERT atômico preserva contagens e conclusão em
concorrência. Reenvio de POST conta nova tentativa; não há idempotência nesta versão.
Não há evento separado que permita ao cliente declarar conclusão sem validação.

Exemplo, com o UUID devolvido pela primeira lição:

```http
POST /exercises/a1-cavalo/validate?usuario_id=SEU_UUID
Content-Type: application/json

{"version":1,"action":{"type":"move","source":"b1","destination":"c3"}}
```

Depois consultar `/progresso/exercicios?usuario_id=SEU_UUID` devolve registro de A1,
concept_id movimento_cavalo, status completed, attempts e updated_at.

Erros de `/exercises` continuam exclusivamente `{code, message}`, inclusive UUID inválido.
Erros das rotas legadas e de `/progresso/exercicios` continuam no contrato Resposta. Limites,
Pydantic, validação de histórico/FEN/lances, timeout LLM, rate limit existente, allowlist de
documentos e isolamento de chaves no backend foram preservados.

## Fontes usadas, complementares e legado

- **Regras V1:** resumos FIDE curados e mapa de artigos; PDF FIDE permanece cadastrado para
  conteúdo aberto e acesso ao documento quando instalado.
- **Explicações abertas de fundamentos:** Capablanca no índice fundamentos.
- **Tática e explicações de análise:** Regis no índice estrategia; fallback documental de
  fundamentos continua disponível.
- **Fatos de análise:** Stockfish e python-chess, independentes dos livros.
- **Staunton:** complementar legado, preservado no índice fundamentos. Pode aparecer no
  fallback e em citações; nenhum novo fluxo curado o exige.
- **Lasker:** complementar opcional cadastrado, não dependência obrigatória desta entrega.

O diretório `backend/docs` desta cópia está vazio e os índices não estão ingeridos. Os
resumos curados funcionam sem corpus; testes documentais simulam busca ou pulam quando
faltam índices. Abrir um arquivo via `/documentos` exige que ele esteja instalado. Esta
entrega não baixou documentos, não reingeriu PDF e não validou qualidade do corpus real.
O `/health` existente ainda informa prontidão dos índices e pode estar degradado apesar
de referências curadas e exercícios funcionarem. Documentos legados não são necessariamente
dependências do produto. O pipeline histórico e suas decisões de chunking permanecem
registrados em CLAUDE.md; não se tornam requisitos de novos fluxos curados.

## Garantias e dívidas adiadas

A3 usa `material_minimax_v1`, até dois lances do aluno/quatro plies, com defesa canônica e
garantia de ganho limitada ao horizonte e à política material. Não prova resultado da partida.
E1 usa `bounded_safety_v1`, três plies, enumeração legal e prioridade para mate antes de
material; `correct` garante apenas segurança no horizonte configurado, não segurança futura.
Não há garantia geral de tática, causalidade de engine ou análise completa de sacrifícios.

Ficam adiados frontend, login/autorização, deploy, billing, infraestrutura pública,
idempotência de tentativas, qualidade do RAG aberto, chunking, corpus avançado, embeddings,
currículo maior e análise nova de PGN. Nenhum desses trabalhos foi iniciado.

## Arquivos da entrega

Criados: `backend/conceitos.py`, `backend/regras_curadas.py`,
`backend/tests/test_backend_v1.py`, `BACKEND_V1.md`.

Modificados: `backend/schemas.py`, `backend/main.py`, `backend/progresso.py`,
`backend/retrieval.py`, `backend/onde_ler.py`, `backend/exercises/api.py`,
`backend/agents/base.py`, `backend/agents/router.py`, `backend/agents/analista.py`,
`backend/agents/licoes.py`, `backend/agents/professor.py`, `README.md`, `CLAUDE.md`.

## Validação

Da pasta backend:

```sh
pytest -q -m 'not llm and not modelo_real'
pytest -q tests/test_exercises_models.py tests/test_exercises_validation.py tests/test_exercises_api.py
```

A suíte de integração V1 usa LLMs falsos, banco temporário e falha explicitamente se regras
conhecidas chamarem embeddings ou ChromaDB. Cobre lições/cache antigo, perguntas, estratégia,
análise, listas vazias, referências, progresso parcial/incorreto/correto, leitura, UUID
inválido, isolamento entre usuários, validação stateless e concorrência.
Testes antigos foram preservados sem alterações. Testes LLM reais não executados. O teste
`modelo_real` não foi executado, pois exige o modelo de embeddings instalado; quatro testes
de retrieval são pulados por falta de índices. Stockfish foi exercitado pela suíte local.

Resultado da execução final: **598 aprovados, 4 pulados e 61 não selecionados**
(60 testes LLM e um teste com embeddings reais). Subsuíte A1/A2/A3/E1: **270 aprovados**.
Inclui **24 novos casos de integração V1**. Compilação dos módulos Python também passou.
