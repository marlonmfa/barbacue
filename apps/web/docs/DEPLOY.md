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

## Imagens do cardápio (tabela `media_assets`) — migration 0006

O admin (`/admin/products`) deixa o dono **enviar fotos** direto do dispositivo.
Elas são guardadas como bytes na tabela `media_assets` (Postgres `bytea`) e
servidas por `GET /api/media/<uuid>`; `products.image_url` aponta pra esse
caminho. **Por que no banco e não em arquivo?** O deploy usa `rsync --delete` a
partir do Mac de dev — qualquer arquivo gravado no `public/` do servidor seria
apagado no próximo deploy. No banco, o upload do dono sobrevive a deploys.

Passos de deploy pra essa migration:

```bash
# a partir de apps/web, com DATABASE_URL no ambiente
npm run db:migrate        # aplica 0006_fancy_wallop.sql (CREATE TABLE media_assets)
```

> **Journal fora de sincronia:** se o `db:migrate` falhar tentando recriar
> tabelas antigas (banco criado originalmente via `db:push`), aplique só a 0006
> à mão — o conteúdo é um único `CREATE TABLE media_assets (...)`:
> `psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS media_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, mime text NOT NULL, data bytea NOT NULL, byte_size integer NOT NULL, created_at timestamptz DEFAULT now());"`

> **Dono da tabela (gotcha 42501):** se a migration rodar como **superusuário**
> do Postgres, o role da aplicação (`barbacue`) não consegue ler/gravar e tanto o
> upload quanto o serviço de imagem retornam 500. Depois de criar a tabela, rode:
> `psql "$DATABASE_URL" -c "ALTER TABLE media_assets OWNER TO barbacue;"`
> (Não fica no arquivo da migration porque o role varia por ambiente — em dev é
> `marlonalcantara`, em prod é `barbacue`.)

> **Crescimento/limpeza:** trocar ou remover a foto de um produto deixa a linha
> antiga em `media_assets` (órfã). É desprezível pra um cardápio pequeno (poucas
> centenas de KB por foto, já reduzidas no navegador antes do upload). Uma limpeza
> futura pode apagar linhas cujo `id` não aparece em nenhum `products.image_url`.
