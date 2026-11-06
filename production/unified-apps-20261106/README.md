# Carrinho único nos apps e login Google/Apple — 06/11/2026

Publicado no contêiner LXD `otherpages` da hirable (o `otherpagesandig` foi unificado
nele em 05/11; a porta 2212 e `ssh vps-otherpagesandig` não existem mais). Acesso:
`ssh vps-otherpages` (2211). PM2 `barbacue`, 127.0.0.1:3007, `/root/barbacue/apps/web`,
dist `.next-mobile-session-20261024`.

Build anterior `Ubxn0DkMyM1kdBYqGRCyF` → novo `qpGjxKPtnI2gYldHk7UC0` (121 rotas nos dois).

Fonte: `production/admin-access-20261103/active-inputs.tar.gz` + overlay daquela pasta
(branch `codex/barbacue-cog-admin-20261103`), que reproduz o build de 04/11. Sobre ela:
- `/api/products` devolve `brand` e `shared`.
- `/api/orders` aceita `items[].brand`: cada item é buscado no catálogo do seu restaurante;
  item comum (bebidas, cervejas) fica sem etiqueta; painel, cozinha e garçom mostram a etiqueta.
- Login Google/Apple (`b5f70cf`), migration 0021 aplicada manualmente em transação.
- Ambiente PM2: `GOOGLE_*`, `APPLE_*`, `DOMAIN_CHELAS`, `DOMAIN_HOTDOG`.

O checkout web (`/pedir`) continua com o carrinho misto de 31/10: em pedido misto o nome leva
o restaurante na frente, inclusive nas bebidas. Não foi alterado nesta publicação.

Backup e reversão em `/srv/barbacue-unified-20261106/backup`: `barbacue.dump` (pg_dump),
`dump.pm2`, `live-build`, `previous-runtime`. Para reverter o código: parar `barbacue`, trocar
o dist por `previous-runtime`, reiniciar. As colunas da 0021 podem ficar: o build antigo as ignora.

Verificação: `publish.py` testa candidata e publicação nos três hosts: páginas, catálogo com
`brand`/`shared`, botões e redirecionamentos Google/Apple, guardas de admin, logos, e um POST em
`/api/orders` com item inexistente (422 antes de gravar). Nenhum pedido real foi criado. Login
real com conta Google/Apple não foi testado; o `redirect_uri` só se confirma com ele.

## A `main` depois desta publicação
`apps/web` e `packages` da `main` agora são o código de produção. Exceções: `_journal.json` segue
o da `main` (produção aplicou 0020, 0021 e 0024 fora do journal) e `schema.ts` mantém
`kitchenPrintDevices`/`kitchenPrinterRoutes` para o painel de impressoras que só a `main` tem.
Arquivos só da `main` (configuração de IA, painel de impressoras) foram mantidos, mas não estão
em produção. O trabalho sem commit em `~/Repos/barbacue.cog.ia.br` (caixa, entregas por QR etc.)
não foi trazido. Parte dele já está em produção e agora na `main`; o resto continua só lá.
