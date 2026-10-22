# Ícones por marca e imagens de lanches — 20/09/2026

Publicado em Chelas, Barbadog e Barbacue. Os ícones de aba e de instalação agora usam a identidade de cada marca, reaproveitada dos aplicativos. A convenção global `app/icon.png` foi substituída por metadados específicos, inclusive nas páginas `/atendimento/[brand]`, e rotas de compatibilidade por domínio.

Foram geradas **31 imagens ilustrativas para 32 produtos**: 18 no Chelas e 14 no Barbadog. O Croissant Double Smash tem a mesma preparação nos dois catálogos e compartilha a imagem. O Barbacue já tinha imagem em todos os lanches. Foram preservadas as imagens existentes, os preços, as descrições e os demais campos.

Escopo: lanches e pratos principais (quesadillas, burritos, nachos, kit de tacos, hot dogs, sanduíches e hambúrgueres). Bebidas, acompanhamentos e sobremesas sem foto não foram incluídos nesta rodada.

## Arquivos e geração

- [Imagens finais WebP](../../public/menu/brands-2026-09/): 900 pixels, sem recorte do alimento.
- [Ícones finais](../../public/brand/icons/): PNG de 64 e 180 pixels por marca; originais preservados.
- [Visão geral das imagens](contact-sheet.png).
- [Prompts de geração e originais](generated.json), [ajustes finais](edits.json).
- [Associações por ID externo e nome](../../src/data/generated-brand-images.json).

Modo de geração: ferramenta integrada `image_gen`, sem CLI/API externa. Prompt comum: fotografia ilustrativa de produto, seguindo ingredientes e quantidades do cadastro, prato e fundo em creme, luz suave, alimento inteiro, sem texto, logotipo ou acompanhamentos adicionais. Os prompts completos de cada imagem estão nos arquivos acima. A revisão removeu dois potes de molho extras e a maionese que não constava na descrição do Chicken Jr. `install-brand-images.mjs` converte os originais e gera a folha de revisão; `prepare-brand-images.mjs` atualiza as associações e prepara SQL transacional.

## Publicação

A infraestrutura mudou: o tráfego atual chega ao **91.108.125.60**, no container LXD **otherpagesandig** (10.50.0.12). O app permanece em `/root/barbacue/apps/web`, porta 3007 dentro do container. O servidor 72.60.31.220 da documentação anterior deixou de ser o destino atual.

A publicação visual foi isolada do restante do aplicativo:

- Backup da tabela e dos dois vhosts em `/root/backups/brand-images-20260920/` dentro do container.
- [SQL aplicado](apply.sql): 32 atualizações, transação única, exige que cada ID/nome ainda tenha imagem vazia. [Reversão](rollback.sql) só restaura registros que continuam apontando para a imagem nova.
- Arquivos WebP no `public/menu/brands-2026-09/` do aplicativo e em `/var/www/barbacue-brand-menu/`, servidos diretamente pelo nginx.
- Ícones em `/var/www/barbacue-brand-icons/`.
- Mapa de marcas em `/etc/nginx/sites-enabled/00-barbacue-brand-icons-map.conf`; snippet em `/etc/nginx/snippets/barbacue-brand-icons.conf`, incluído somente nos vhosts das três marcas.
- Filtro de resposta troca as URLs antigas de ícones por URLs da marca com versão de cache e inclui [presentation.css](presentation.css), que identifica as imagens como ilustrativas e mantém o alimento inteiro. As fontes Next.js incorporam o mesmo comportamento para o próximo build.
- Validação nginx passou antes de recarregar. Não foi necessário reiniciar o aplicativo.

Para desfazer a publicação: aplicar `rollback.sql` com `psql -v ON_ERROR_STOP=1`; restaurar os dois vhosts do backup; remover mapa/snippet específicos desta atualização; executar `nginx -t` e recarregar nginx. Os arquivos novos podem permanecer sem associação.

## Verificação

[Relatório de produção](verification.json): seis ícones e 31 WebP responderam HTTP 200 com SHA-256 igual ao local. Os catálogos preservaram 66 produtos no Chelas e 71 no Barbadog, alterando somente as 32 URLs previstas. Chromium móvel verificou todas as imagens novas, legenda, `object-fit: contain` e ausência de rolagem horizontal. [Chelas no celular](chelas-mobile.png), [Barbadog no celular](barbadog-mobile.png).

TypeScript e ESLint dos arquivos modificados passaram. O verificador reproduzível é `node apps/web/tests/brand-images.verify.mjs` na raiz do monorepo.

## Atualização após o deploy completo

A versão completa `tmxZJWyN8E7YeYrnDoK5E` foi publicada em 20/09/2026. Os metadados e a legenda agora são produzidos pelo próprio Next.js; o filtro temporário nginx foi removido. A verificação foi repetida usando os componentes finais. Detalhes em [PRODUCTION.md](../PRODUCTION.md).
