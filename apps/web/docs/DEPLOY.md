# Deploy — app web (Next.js)

A imagem é **standalone** (`output: "standalone"` em `next.config.ts`) e o build
**não precisa de banco** (a home renderiza por requisição). As migrations são
aplicadas por um serviço one-shot (`migrate`, que roda `drizzle-kit migrate`)
antes do `web` subir — o `web` só inicia depois que ele termina com sucesso.

## Opção A — Docker Compose (Postgres + web juntos)

Na raiz do monorepo, com o `.env` preenchido (veja `.env.example`):

```bash
docker compose up -d --build
```

Sobe `postgres` + `web` na porta 3000. O serviço `web` espera o Postgres ficar
saudável, aplica `apps/web/drizzle/migrations/*.sql` e inicia. As variáveis
`OPENAI_*` e `ADMIN_*` vêm do `.env` da raiz (interpoladas pelo compose).

## Opção B — Só a imagem web (banco gerenciado à parte)

O build context é a **raiz** do monorepo:

```bash
docker build -f apps/web/Dockerfile -t barbacue-web .

docker run -d --name barbacue-web -p 3000:3000 \
  -e DATABASE_URL="postgresql://USER:PASS@HOST:5432/barbacue" \
  -e OPENAI_API_KEY="sk-..." \
  -e OPENAI_MODEL="gpt-4o-mini" \
  -e ADMIN_PASSWORD="..." \
  -e ADMIN_COOKIE_SECRET="..." \
  -e ADMIN_MASTER_PASSWORD="..." \
  barbacue-web
```

## VPS (`barbacue.hirableaiagents.com`)

1. Instale Docker no host (`HOST_VPS`).
2. Copie o repositório + `.env` para o host.
3. `docker compose up -d --build`.
4. Ponha um reverse proxy (nginx/Caddy) na frente, encaminhando 443 → `web:3000`,
   com TLS (Let's Encrypt) para o domínio.

## Migrations

Geridas pelo **drizzle-kit** (journal em `apps/web/drizzle/migrations/meta/`).
No compose, o serviço `migrate` aplica tudo automaticamente. Manualmente:

```bash
# a partir de apps/web, com DATABASE_URL no ambiente (ou no .env da raiz)
npm run db:migrate          # aplica migrations pendentes (drizzle-kit migrate)
npm run db:generate         # gera nova migration após editar src/db/schema.ts
```

> Banco novo (sem tabelas): `db:migrate` cria o schema inteiro (0000 → 0002).
> O cardápio começa vazio — popule com o scraper (`npm run seed` na raiz).

## Variáveis obrigatórias em produção

`DATABASE_URL`, `OPENAI_API_KEY` (sem ela `/api/chat` responde 503), `OPENAI_MODEL`
(opcional), `ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET`, `ADMIN_MASTER_PASSWORD`.

> Rotacione a chave OpenAI antes de produção — ela já esteve versionada em texto puro.
