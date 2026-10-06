# Release candidate v1.0.0

Requisitos validados: Python 3.11.15, Node 24.16.0/npm 11.13.0, macOS arm64 e Stockfish 19 instalado separadamente. As constraints registram este ambiente, sem hashes; outra plataforma precisa validar seus binários e instalação. Não há download automático de Stockfish, livros ou corpus. O core (conta, Game, agente, rating, comentário local, SAN/replay/PGN) não precisa de chaves LLM nem corpus. Tutor/RAG e atualização FIDE são opcionais e dependem de configuração/rede.

## Instalação

Na raiz do checkout, criar uma venv isolada e instalar:

```sh
python3.11 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt -c backend/requirements-constraints.txt
.venv/bin/python -m pip check
cd frontend
npm ci
VITE_API_URL=/api npm run build
```

Servir `frontend/dist` na raiz da origem HTTPS. `/api` neste comando pressupõe um proxy que remove esse prefixo e encaminha ao backend. Sem esse proxy, definir a URL HTTPS real da API antes do build; vazio usa a mesma origem, sem prefixo. Variáveis `VITE_*` são públicas, incorporadas no build: nunca colocar senha, token ou chave de backend. `.env` local com URL HTTP precisa ser sobrescrito no build de produção; URL HTTP é recusada com mensagem explícita. Mudança da URL exige novo build. Desenvolvimento continua com `npm run dev` e URL local de `frontend/.env.example`.

## Ambiente do backend

Definir no ambiente do serviço ou `.env` protegido (não copiar defaults locais do exemplo para produção):

| Variável | Requisito / comportamento |
| --- | --- |
| `APP_ENV=production` | Ativa validação de produção. |
| `CORS_ORIGENS` | Obrigatória: array JSON de origens HTTPS reais, exatas, sem `/` final, caminho ou wildcard. Incluir a origem do frontend mesmo usando proxy. |
| `DB_AUTH`, `DB_PROGRESSO`, `MASTERS_CACHE_PATH` | Obrigatórios: três arquivos absolutos distintos, fora da pasta backend, em volume persistente gravável. Masters agora também lê `.env`. |
| `AUTH_COOKIE_SECURE=true` | Default em produção; `false` é recusado. Cookie HttpOnly, SameSite=lax, Path=/, sete dias. |
| `AQUECER_NA_INICIALIZACAO=false` | Default em produção; o core não carrega embeddings no lifespan. |
| `STOCKFISH_PATH` | Nome `stockfish` no PATH por padrão, ou caminho absoluto do executável instalado. Validar versão19 no host de publicação. |
| `DOCS_DIR`, `CHROMA_DIR`, `LOG_GUARDRAILS` | Definir caminhos persistentes quando habilitar tutor; documentos/índices/modelo não acompanham Git. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Secrets opcionais, vazios por padrão. Configurar somente o provedor escolhido. |
| `LLM_PROVIDER` e modelos/limites | Configuração existente em `backend/config.py`; não se confirmou disponibilidade dos modelos remotos. |
| `ADMIN_TOKEN` | Secret opcional; vazio mantém `/ingest` desativado. |

A validação de paths não comprova que o volume seja persistente: verificar no provedor escolhido. Preparar diretório privado, dono igual ao usuário do serviço, modo0700 e `umask 077`. Auth/progresso são restringidos a0600 ao conectar; backups também0600. Masters/cache/logs herdam umask. Não executar como root. Não gravar bancos em `dist`, no checkout de release ou em filesystem efêmero. Não compartilhar os arquivos com outros serviços. Games/rating/events persistem até remoção administrativa ou futura política; nenhuma limpeza automática foi introduzida.

Provisionar conta com a mesma configuração de produção, sem senha no comando:

```sh
cd backend
../.venv/bin/python configure_owner.py
```

## Execução, HTTPS e recursos

Executar com ambiente já configurado e **um worker**:

```sh
umask 077
cd backend
../.venv/bin/python -m uvicorn main:app --workers 1 --no-access-log
```

A porta/bind do serviço devem ser definidos pela plataforma/proxy; não expor HTTP diretamente à internet. TLS termina no proxy/plataforma, com certificado confiável. Manter frontend/API no mesmo site HTTPS (preferencialmente mesma origem com proxy), compatível com SameSite=lax. Produção cross-site não foi implementada. Cookies Secure não são enfraquecidos para smoke HTTP. Se habilitar access logs no proxy, não registrar Cookie/Authorization/corpos/query sensível. Confiar headers de proxy somente dos proxies realmente controlados.

Slots Stockfish e rate limits são por processo, não globais. Um worker é a estratégia inicial; não há coordenação multiworker, cancelamento distribuído ou fila. Também não há limite global dos cálculos de exercícios/análise: dimensionar para uso pessoal/controlado; exposição pública de grande carga exige trabalho adicional. Policy usa limites existentes (até0,70s/50000nós e protocolo5s), processo por cálculo, quit/close/finally. Shutdown gracioso deve esperar requisições em andamento; interrupção abrupta do host não é garantia de limpeza. Não há daemon de engine no startup.

`GET /health` retorna200 de liveness, disponibilidade do executável e metadados não secretos. Em produção não abre Chroma/modelo/LLM; `indices={}` significa não inspecionado. `degradado` com LLM ausente não impede jogar; não usar esse campo como falha de liveness. Presença do executável/chave não prova funcionamento: realizar smoke UCI e Game. `/docs`, `/redoc`, `/openapi.json` permanecem públicos conscientemente; autorização das rotas privadas continua no servidor. Cache-Control no-store já protege respostas privadas; PDF/PGN possuem nosniff. Headers do frontend/TLS dependem do servidor escolhido; CSP não foi inventada sem validar a implantação.

Logs locais de erro usam camada/classe, sem detalhes de SDK ou payloads. Não habilitar debug/tracing externo sem revisar dados enviados. Falha de FIDE usa snapshot stale/vazio; timeouts externos e ausência de LLM não escolhem lances nem alteram rating. Consultas documentais dependem do corpus; não há fallback que invente fontes.

## Backup, verificação e restore

Parar aplicação e provisionamento para obter um conjunto auth/progresso/Masters da mesma janela. A ferramenta usa a API de backup do SQLite, incluindo conteúdo confirmado em WAL, verifica integridade e publica sem sobrescrever destino. Cada snapshot isolado também é consistente durante escrita, mas múltiplos bancos não têm transação conjunta.

Definir `BACKUP_AUTH`, `BACKUP_PROGRESSO` e `BACKUP_MASTERS` como arquivos novos em diretório privado de backup; os paths runtime já são os do ambiente do serviço:

```sh
cd backend
../.venv/bin/python sqlite_backup.py backup "$DB_AUTH" "$BACKUP_AUTH"
../.venv/bin/python sqlite_backup.py backup "$DB_PROGRESSO" "$BACKUP_PROGRESSO"
../.venv/bin/python sqlite_backup.py backup "$MASTERS_CACHE_PATH" "$BACKUP_MASTERS"
../.venv/bin/python sqlite_backup.py verify "$BACKUP_AUTH"
../.venv/bin/python sqlite_backup.py verify "$BACKUP_PROGRESSO"
../.venv/bin/python sqlite_backup.py verify "$BACKUP_MASTERS"
```

Masters pode ainda não existir antes da primeira consulta; nesse caso registrar a ausência e omitir seu backup. Proteger cópias de auth como credenciais/sessões; definir retenção/cópia externa criptografada conforme a política do operador. Não versionar snapshots.

Para restore, manter servidor parado e definir três novos destinos (`RESTORE_AUTH`, `RESTORE_PROGRESSO`, `RESTORE_MASTERS`), sem sobrescrever bancos existentes:

```sh
../.venv/bin/python sqlite_backup.py restore "$BACKUP_AUTH" "$RESTORE_AUTH"
../.venv/bin/python sqlite_backup.py restore "$BACKUP_PROGRESSO" "$RESTORE_PROGRESSO"
../.venv/bin/python sqlite_backup.py restore "$BACKUP_MASTERS" "$RESTORE_MASTERS"
```

Apontar as variáveis do serviço aos destinos restaurados; iniciar, verificar sessão/Game/rating/eventos e somente então decidir a disposição das cópias antigas. Não misturar arquivos antigos `-wal/-shm` com o restore. Não apagar backups nem banco original automaticamente. Documentos/Chroma/modelo têm backup separado com consumidores/ingestão parados, conforme armazenamento escolhido; esta ferramenta cobre apenas SQLite. Migrações no startup são aditivas/idempotentes; fazer backup antes da troca de release e validar restore em outro diretório.

## Checklist de implantação

- Instalar requisitos e Stockfish19 no host/plataforma escolhidos; validar instalação limpa nessa plataforma.
- Montar volume persistente privado; definir paths distintos, origens HTTPS e secrets opcionais no ambiente.
- Instalar TLS confiável/proxy e servir dist na raiz; verificar prefixo/URL pública da API e favicon/assets.
- Provisionar conta, um worker, umask077; confirmar startup sem chaves e health200.
- Testar login/Secure/sessão, ambas cores/IA, terminal/rating, reload/retomada, comentário/PGN/replay e logout.
- Verificar backup/restauração de um conjunto privado e restart sem perda/duplicação de eventos.
- Conferir logs, limites de recursos e shutdown; validar provedores/corpus apenas se habilitados.
- Criar commit/tag somente após revisão autorizada. Este estágio não realiza commit/tag/deploy.
