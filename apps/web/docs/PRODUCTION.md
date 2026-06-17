# Produção — barbacue.hirableaiagents.com (runbook real)

Setup atualmente NO AR. Difere do `DEPLOY.md` (docker-compose): em produção
roda como **standalone Next.js sob PM2 + nginx**, num VPS compartilhado, para não
gastar disco/RAM com build no servidor.

## Infra
- **VPS:** 72.60.31.220 (Ubuntu 24.04). SSH: `ssh root@72.60.31.220`.
- **App:** PM2 `barbacue`, standalone server em `127.0.0.1:3007`
  (`/root/barbacue/apps/web/server.js`, config `/root/barbacue/ecosystem.config.js`).
- **DB:** Postgres nativo do host, base `barbacue` (role `barbacue`), `localhost:5432`.
- **nginx:** `/etc/nginx/sites-available/barbacue.hirableaiagents.com.conf` →
  proxy para `127.0.0.1:3007`, TLS Let's Encrypt (renovação automática via certbot).
- **Privacidade:** `public/privacy.html` → https://barbacue.hirableaiagents.com/privacy.html

## Variáveis (no `ecosystem.config.js` do VPS — NÃO no .env)
`DATABASE_URL` (localhost:5432/barbacue), `OPENAI_API_KEY`, `OPENAI_MODEL`,
`ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET`, `ADMIN_MASTER_PASSWORD`, `PORT=3007`,
`HOSTNAME=127.0.0.1`. O standalone NÃO lê o `.env` da raiz em runtime — env vem do PM2.

## Redeploy (após mudanças no código)
Build local + envio do bundle standalone (sem build no servidor):

```bash
cd apps/web
rm -rf .next && env -u DATABASE_URL npx next build      # gera .next/standalone
cp -r .next/static .next/standalone/apps/web/.next/static
cp -r public        .next/standalone/apps/web/public
rsync -az --delete .next/standalone/ root@72.60.31.220:/root/barbacue/
ssh root@72.60.31.220 'pm2 restart barbacue'
```

## Migrations
Aplicadas direto no Postgres do host. Para schema novo: gere com
`npm run db:generate` e aplique no VPS (`psql "$DATABASE_URL" -f drizzle/migrations/<nova>.sql`).
A base atual foi provisionada via `pg_dump` da base de desenvolvimento.

## Operação
```bash
ssh root@72.60.31.220 'pm2 logs barbacue --lines 50'   # logs
ssh root@72.60.31.220 'pm2 restart barbacue'           # restart
ssh root@72.60.31.220 'pm2 status'                     # status
```

## Pendências de infra
- O VPS antigo (91.108.125.60) ainda tem um PM2 `barbacue` órfão (porta 3005) e
  vhost nginx — sem tráfego (DNS já aponta pro novo). Pode ser parado quando quiser:
  `ssh root@91.108.125.60 'pm2 delete barbacue'` + remover o vhost.
