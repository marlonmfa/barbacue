# Fotos e tema do /pedir — 24/10/2026

Publicado nas três lojas: Barbacue, Barbadog e Chelas. Build `EtxAmEp8KHHiFMka_Wec8`, sobre a versão do checkout `vFPgH7G29sn-SJgE1G1AT`.

O cardápio, carrinho, formulário, pagamento e comprovante usam superfícies escuras, texto claro e o vermelho da marca. O QR Code mantém fundo branco para leitura. A folha de estilo é exclusiva do pedido online.

## Imagens

- 139 fotografias existentes editadas e 9 imagens criadas com o `image_gen` integrado, usando os produtos e descrições importados.
- 148 arquivos WebP em `../../public/menu/pedir-2026-10/`, com fundo carvão, luz quente e enquadramento consistente. A exportação preserva a composição inteira.
- 269 associações de imagens revisadas entre as três lojas, incluindo reutilização do mesmo produto. Todos os alimentos que estavam sem foto receberam imagem. Algumas bebidas sem correspondência exata continuam sem foto.
- As imagens editadas ou geradas aparecem identificadas como ilustrativas. Os dois combos do Chelas que mostravam logo/pessoas receberam imagens dos alimentos descritos.
- Revisão visual das 148 imagens; corrigidas porções de quatro anéis de cebola, seis churros, dez empanados de Gouda e oito dadinhos de tapioca.

`prompts.json` registra referências, descrições, associações, instruções e hashes dos arquivos finais. Os dois primeiros testes de estilo têm resumo da instrução, explicitamente identificado. Os demais têm a instrução exata preservada.

As associações ficam em `src/data/pedir-product-images.json`. `orderingImage` só aplica a foto revisada quando restaurante, id, nome e imagem original coincidem. Uma nova foto enviada pelo proprietário tem precedência. Os URLs originais no banco foram preservados.

## Validação e publicação

- Build de produção e ESLint aprovados.
- Três testes de regressão conferem identidade, novas fotos do proprietário e existência dos arquivos.
- Checkout Pix conferido com provedor simulado em banco separado, sem cobranças reais; carrinho e recibo conferidos no Chrome em 390 px.
- 182 checks no candidato de produção: imagens, catálogo, rotas e acesso protegido.
- `deployment.json` e `public-verification.json` registram a publicação e a conferência pública.
- A fonte foi comparada com a versão ativa: apenas os seis arquivos da apresentação de `/pedir` mudaram. Código de pagamento preservado.

O serviço continua no PM2 existente, porta 3007. Nenhuma imagem Docker foi substituída. Backup de aplicação e banco: `/root/deploy-backups/barbacue-dark-images-20261024`; aplicação anterior: `/root/barbacue-before-dark-images-20261024`. Banco, contas, pedidos, configuração e instalador Windows preservados.
