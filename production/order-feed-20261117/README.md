# Feed de pedidos no ar — 17/11/2026

Build `Uzu3i5IkqaLwlx5b3GjSA` (15/11, fonte `work/deploy-unified-source` no Mac) → `DUMA3YsYPO9Ek-QXlR7Oq`,
dist `.next-order-feed-20261117`. 117 rotas mantidas + `/admin/orders/feed` e `/api/admin/orders/[id]/comanda`.

Fonte: este branch = snapshot do código publicado em 15/11 (commit "código publicado em 15/11") + o
`feat/admin-order-feed` aplicado à mão (página de pedidos e CSS tinham conflitos), mais o item
"Feed de pedidos" no app Windows (`apps/desktop/src/modules.mjs`). Chave de Server Actions igual à do
build anterior. Sem migração de banco.

Publicação: `publish-order-feed.cjs` em `/root/deploy-backups/barbacue-order-feed-20261117` (candidata na
3017, troca do `server.js`, reversão automática). Dump do banco antes: `barbacue-before.dump` na mesma pasta.
Reverter: `cp server.before.js /root/barbacue/apps/web/server.js && pm2 restart barbacue`.

## Atenção: regressão desde 13/11
O build de 15/11 (e o `.next-unified` de 13/11) saiu de uma base anterior à `main` de 06–09/11. Faltam no ar:
`/admin/financeiro` (DRE/DFC/extratos, PR #10), Pix C6 no checkout, rótulo "Anota AI" no painel,
webhook `/api/webhooks/anota`, abas novas do `/admin/ifood`. Juntar `origin/main` nesta base dá 13 conflitos
em login/SSO (`cog-sso`, `admin-auth`, `proxy`…): a `main` tem SSO nativo/OIDC que o build de 13/11 não tem.
Não foi resolvido aqui.
