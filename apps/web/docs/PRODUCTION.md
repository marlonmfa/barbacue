# Produção — barbacue.cog.ia.br

> **Tema e fotos de /pedir publicados em 24/10/2026:** build ativo
> `EtxAmEp8KHHiFMka_Wec8`, `distDir` `.next-dark-images-20261024`.
> Tema escuro em todo o checkout, 139 fotos editadas e 9 imagens criadas.
> Os cardápios, contas e pedidos foram preservados. Acesso atual por SSH:
> `ssh -p 2212 root@91.108.125.60`.
> [Imagens, validação, publicação e backup](pedir-images-2026-10/README.md).

> **Pedidos online publicados em 24/10/2026:** build `vFPgH7G29sn-SJgE1G1AT`,
> `distDir` `.next-online-20261024`, no mesmo PM2/container. `/pedir` atende as
> três marcas com os cardápios importados, Pix Asaas e liberação automática para
> produção após confirmação. Conserva o login individual da publicação abaixo.
> [Fluxo, configuração, testes e rollback](ONLINE-CHECKOUT.md).

> **Login atualizado em 24/10/2026:** build ativo `tj6YNAphSh5BmbsaEUV5L`,
> `distDir` `.next-individual-login-20261024`, no mesmo PM2/container.
> Usuário ou e-mail obrigatório, acesso e sessões de senha mestre desativados.
> As duas contas individuais exigem troca de senha no primeiro acesso.
> [Registro da mudança, testes e backup](LOGIN-EQUIPE.md).

> **Atualização verificada em 20/09/2026:** o DNS de `barbacue.cog.ia.br` aponta para `91.108.125.60`. O ambiente atual está no container LXD `otherpagesandig` desse host. Os caminhos e a porta 3007 abaixo são internos ao container. Não publicar no antigo host `72.60.31.220`. Acesso: `ssh root@91.108.125.60`, depois `lxc exec otherpagesandig -- bash`. Veja [a publicação de imagens e ícones](image-audit/../brand-images-2026-09/README.md).

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

## Publicação completa — 20/09/2026

- Build ativo: `tmxZJWyN8E7YeYrnDoK5E`, gerado com Next.js 16.2.6 (`next build --webpack`), TypeScript validado. Diretório do build: `apps/web/.next-release-20260920`.
- Publicado no container LXD `otherpagesandig` do host `91.108.125.60`, processo PM2 `barbacue`, porta interna 3007.
- Inclui navegação entre marcas, `/atendimento/barbacue`, `/atendimento/chelas`, `/atendimento/barbadog`, gravação/anexo de áudio e `/api/transcribe` com `whisper-1`, além dos ícones e 31 ilustrações de 32 produtos.
- Antes da troca, a versão candidata foi validada na porta 43008 usando as configurações de produção: três cardápios, três respostas reais de IA, transcrição real, administração e integridade do instalador Windows privado. Nenhum pedido foi criado.
- Backup completo do banco, aplicativo e configuração privada PM2: `/root/deploy-backups/barbacue-full-20260920/`. Versão anterior preservada em `/root/barbacue-before-full-20260920/`.
- O instalador Windows foi copiado da versão ativa, com tamanho e SHA-256 conferidos; os chunks estáticos anteriores foram preservados para abas abertas.
- Removido o filtro nginx temporário de metadados/HTML: a nova aplicação produz os ícones e legendas diretamente. As rotas de compatibilidade de imagens permanecem. `/api/transcribe` aceita até 21 MB no nginx e a aplicação valida o áudio em até 20 MB.
- Após ativação: navegador validou separação das conversas, restauração por marca, transcrição editável, falha com texto preservado e tela móvel. Foi realizada também transcrição real pelo HTTPS público.
- Rollback: parar o processo PM2, mover a versão atual para um diretório de diagnóstico, restaurar `/root/barbacue-before-full-20260920` para `/root/barbacue`, restaurar `nginx-brand-snippet.conf` do backup no snippet nginx, validar nginx e reiniciar PM2/recarregar nginx. Nenhuma migração de esquema foi necessária.

## ERP publicado — 20/09/2026

- Build ativo: `e361pHSgl2MXzFLukRsnH`, gerado com `next build --webpack` em `apps/web/.next-erp-release-20260920`.
- Destino confirmado: `91.108.125.60`, container LXD `otherpagesandig`, `/root/barbacue`, PM2 `barbacue`, porta 3007. Acesso ERP em `/admin/erp`, exclusivo para administradores.
- Migração `0014_handy_gamora` aplicada pelo instalador `scripts/migrate-erp.mjs`, em transação e com registro no histórico. Importadas 334 fichas: 197 Barbacue, 71 Barbadog e 66 Chelas, todas pendentes de revisão técnica.
- Aprovadas 599 verificações automatizadas contadas, além das suítes de download, importação/impressão e chat; 51 verificações na versão candidata e verificação posterior pelo HTTPS público. [Relatório completo](ERP-VALIDATION-2026-09-20.md).
- Backup do banco, aplicação e ambiente privado PM2: `/root/deploy-backups/barbacue-erp-20260920/`. Aplicação anterior: `/root/barbacue-before-erp-20260920/`.
- Preservados nginx, credenciais, instalador privado e chunks anteriores. Sem dados de teste financeiros na produção.
- Rollback: parar apenas PM2 `barbacue`, preservar o diretório atual e restaurar `/root/barbacue-before-erp-20260920` para `/root/barbacue`; reiniciar e validar. A migração aditiva pode permanecer para preservar os dados do ERP. O dump não deve sobrescrever novos pedidos sem análise.

## Logo no login — 20/09/2026

- Build ativo: `PoSrf2E6dZGSHTotkfQmE`, diretório `.next-login-logo-20260920`.
- `/admin/login` usa a logo oficial `/brand/barbacue-logo.png`, com texto alternativo e dimensões reservadas, substituindo o emoji do cabeçalho.
- Build, ESLint e conferência de desktop/celular aprovados; imagem e formulário também verificados pelo HTTPS público após a publicação.
- Nenhuma migração de banco. Versão ERP anterior preservada em `/root/barbacue-before-login-logo-20260920`; configuração privada PM2 e relatório em `/root/deploy-backups/barbacue-login-logo-20260920/` dentro do container `otherpagesandig`.

## Monitor iFood — 18/10/2026

Adicionado serviço Docker independente em `/root/barbacue-ifood`, no host atual
`otherpagesandig` (SSH 2212). Não substitui o web/PM2 e usa a conexão do Postgres
nativo existente, com credenciais da aplicação Food COG. Leia
[`packages/ifood/README.md`](../../../packages/ifood/README.md) e
[`GUIA-IFOOD.md`](../../../GUIA-IFOOD.md). Estado verificado: `healthy`,
`waiting_authorization` das três lojas; a importação começa quando todas concederem
ORDER/EVENTS. Nenhuma migração ou alteração em contas/volumes foi necessária.

## Gestor iFood publicado — 22/10/2026

- Build ativo: `hXBFWAPcgt6P_MZp1_KNB` (main `e500019`, PRs #3 e #4), `distDir` padrão `.next`.
  Enviado com `rsync` **sem** `--delete` para `/root/barbacue/` no container `otherpagesandig`
  (`ssh vps-otherpagesandig`, 91.108.125.60:2212). O alias `otherpagesandig` do `~/.ssh/config`
  ainda aponta para o host antigo 72.60.31.220 — não use.
- Migração `0015_social_login` aplicada em transação, com registro em `drizzle.__drizzle_migrations`
  (hash SHA-256 do arquivo, `created_at` 1790989371202). A `0014` já estava aplicada.
- PM2 `barbacue`: `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET` e `IFOOD_DRY_RUN=false` copiados do
  `.env` do monitor (`/root/barbacue-ifood/.env`), `pm2 restart --update-env` e `pm2 save`.
- Monitor: `healthy`, `state=monitoring`, `dryRun=false`, três lojas.
- Verificado pelo HTTPS público: `/`, `/admin/login`, login admin, `/admin/ifood` (200) e
  `GET /api/admin/ifood` com `configured=true`, `dryRun=false`, 3 lojas e 34 pedidos.
- **Pendente (iFood, não código):** status/pausa das lojas responde
  `User is forbidden to access this resource` — o app Food COG não tem o módulo Merchant
  autorizado. Habilitar o escopo MERCHANT no Portal do Desenvolvedor e pedir que as três lojas
  reautorizem. Pedidos (ORDER/EVENTS) não são afetados.
- Backup: `/root/deploy-backups/barbacue-ifood-gestor-20261022/` (dump do banco, ambiente PM2,
  SQL aplicado). App anterior: `/root/barbacue-before-ifood-gestor-20261022/`.
- Rollback: restaurar esse diretório para `/root/barbacue` e `pm2 restart barbacue`; a 0015 é
  aditiva e pode permanecer.


## API de sessão para Gestão — 24/10/2026

- Publicada no host existente `otherpagesandig`, SSH `91.108.125.60:2212`,
  aplicação `/root/barbacue`, PM2 `barbacue`, porta 3007.
- Antes: `.next-dark-images-20261024`, build `EtxAmEp8KHHiFMka_Wec8`.
  Comparados 377 arquivos compilados do servidor e `server.js` com a base local: sem diferenças.
- Depois: `.next-mobile-session-20261024`, build `ZnqXTYJAItJLMco5e6go6`.
  Sobreposição isolada de GET sessão, resumo administrativo, biblioteca de resumo
  e mapeamento de permissões; sem publicar as demais mudanças do checkout.
- Backup de aplicação e pg_dump verificado em
  `/root/deploy-backups/barbacue-mobile-session-20261024`. Aplicação anterior
  preservada em `/root/barbacue-before-mobile-session-20261024`.
- 50 verificações antes e depois da troca: sessão anônima/inválida/expirada,
  sessões de equipe e primeiro acesso, permissões do dashboard, três catálogos
  e páginas de pedidos. Hash dos registros da equipe preservado e pedidos não decresceram.
- GET público `/api/admin/auth` responde 401 JSON sem credencial, em lugar do antigo 405.
  Políticas estáticas do Gestão em `/legal/gestao/` respondem 200 por HTTPS.
- Nenhuma migração de banco, troca de imagem Docker, recriação de conta ou
  substituição de .env. Conteúdo público, downloads privados e configuração PM2 preservados.
- Evidência local: `tmp/app-store-release-20261024/api-deployment-verification.json`,
  manifests e quatro arquivos do patch na mesma pasta. O snapshot intermediário
  de build foi removido depois da publicação para liberar espaço; a base e o patch foram preservados.
