# Produção — barbacue.cog.ia.br

Setup atualmente NO AR. Difere do `DEPLOY.md` (docker-compose): em produção
roda como **standalone Next.js sob PM2 + nginx**, num VPS compartilhado, para não
gastar disco/RAM com build no servidor.

## Infra
- **VPS:** 72.60.31.220 (Ubuntu 24.04). SSH: `ssh root@72.60.31.220`.
- **App:** PM2 `barbacue`, standalone server em `127.0.0.1:3007`
  (`/root/barbacue/apps/web/server.js`).
- **DB:** Postgres nativo do host, base `barbacue` (role `barbacue`), `localhost:5432`.
- **nginx:** `/etc/nginx/sites-available/barbacue.cog.ia.br.conf` →
  proxy para `127.0.0.1:3007`, TLS Let's Encrypt (renovação automática via certbot).
- **Privacidade:** `public/privacy.html` → https://barbacue.cog.ia.br/privacy.html

## Variáveis (ambiente PM2 do VPS — NÃO no .env)
`DATABASE_URL` (localhost:5432/barbacue), `OPENAI_API_KEY`, `OPENAI_MODEL`,
`ADMIN_PASSWORD`, `ADMIN_COOKIE_SECRET`, `ADMIN_MASTER_PASSWORD`, `PORT=3007`,
`HOSTNAME=127.0.0.1`, `DOMAIN=barbacue.cog.ia.br`,
`DOMAIN_BARBA=barbacue.cog.ia.br`. O standalone NÃO lê o `.env` da raiz em runtime — env vem do PM2.

## Domínio público (atualizado em 07/09/2026)

- DNS Cloudflare: registro A `barbacue.cog.ia.br` → `72.60.31.220`, TTL 300, sem proxy.
- HTTPS: certificado Let's Encrypt em `/etc/letsencrypt/live/barbacue.cog.ia.br/`, com renovação automática por webroot `/var/www/certbot`.
- nginx: o novo domínio usa um symlink em `sites-enabled/barbacue.cog.ia.br.conf`. O redirecionamento antigo usa `sites-enabled/barbacue-legacy-redirect.conf`; o arquivo regular `sites-enabled/barbacue.hirableaiagents.com.conf` atende apenas Chelas e Barbadog.
- Hook de renovação: `/etc/letsencrypt/renewal-hooks/deploy/barbacue-nginx-reload` valida e recarrega nginx ao renovar o certificado novo.
- O domínio antigo `barbacue.hirableaiagents.com` redireciona páginas com HTTP 308, preservando caminho e parâmetros. `/api/` e `/.well-known/` continuam no proxy para compatibilidade com aplicativos instalados.
- PM2 `barbacue-whatsapp`: `PUBLIC_SITE_URL=https://barbacue.cog.ia.br`. O endereço interno da API continua `http://127.0.0.1:3007`.
- Variáveis atualizadas com `pm2 restart --update-env` e persistidas com `pm2 save`.
- As configurações Android/iOS no repositório usam o novo host; aplicativos publicados precisam de nova versão para incorporar essa alteração.

## Redeploy (após mudanças no código)
Build local + envio do bundle standalone (sem build no servidor):

Antes do build, execute `npm run stage:web --workspace=@barbacue/desktop` na
raiz para preparar o instalador privado (ou gere-o com `dist:win`). Confira o
manifesto e mantenha um backup do aplicativo e do banco antes da troca.

```bash
cd apps/web
rm -rf .next && env -u DATABASE_URL npx next build      # gera .next/standalone
cp -r .next/static .next/standalone/apps/web/.next/static
cp -r public        .next/standalone/apps/web/public
cp -r private-downloads .next/standalone/apps/web/private-downloads
rsync -az --delete .next/standalone/ root@72.60.31.220:/root/barbacue/
ssh root@72.60.31.220 'pm2 restart barbacue'
```

## Publicação Windows — 10/09/2026

- Build publicado: `ldD86TYtQ0pouSEA36JhH`.
- Programa Windows 1.0.0 disponível em `/admin/downloads`, pelo menu
  **Sistema → Programa Windows**, exclusivamente para administradores.
- O instalador fica em `apps/web/private-downloads`, fora de `public`. A rota
  `/api/admin/downloads/windows` exige a sessão de administrador em GET e HEAD
  e responde com cache privado desativado.
- Instalador: 111246686 bytes; SHA-256
  `fb220b910cee33847a7c1c9cdde027cda3310de7df5c1be9b1a0cb3abc24ea6e`.
- Verificação pelo HTTPS público concluída: três lojas, catálogos, configurações
  e administração disponíveis; download completo com hash conferido; visitantes
  e funcionários sem perfil de administrador bloqueados. Evidências no backup,
  em `public-verification.json`.
- Backup anterior à publicação e às migrações:
  `/root/deploy-backups/barbacue-20260910T142106Z/` (banco, aplicativo e ambiente
  PM2 privado). Aplicativo anterior preservado em
  `/root/barbacue-before-20260910T142106Z`.
- Migrações aditivas aplicadas em uma transação: `0006_fancy_wallop`,
  `0010_access_permissions`, `0011_self_service_printing`,
  `0012_delivery_and_roles` e `0013_all_channel_printing`. O ambiente PM2 e as
  credenciais existentes foram preservados.
- A chave `PRINT_AGENT_TOKEN` ainda precisa ser configurada para conectar uma
  estação de impressão. A publicação do instalador não ativa impressoras.

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
