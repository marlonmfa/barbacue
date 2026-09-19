# Revisão de imagens — 7 de setembro de 2026

Publicado em https://barbacue.cog.ia.br/.

Foram examinados os 195 produtos visíveis, os dois produtos desativados, o logotipo, a imagem de compartilhamento e as publicações usadas na interface. Os 195 arquivos do catálogo público carregavam; 76 tinham resolução pequena. O problema mais grave era a associação entre foto e produto: havia flor no lugar de rúcula, macarrão no lugar de bacon, pratos completos no lugar de molhos, bebida no lugar de sobremesa e logotipos no lugar de combos.

## Resultado

- **59 imagens novas**, geradas com a ferramenta integrada `image_gen`, em modo padrão; nenhuma geração via CLI/API externa.
- **102 associações corrigidas**: 91 produtos usam as novas ilustrações e 11 reaproveitam fotos adequadas do próprio catálogo. Destes, 100 estão visíveis e dois continuam desativados.
- Logotipo, identidade da marca, fotos adequadas dos hambúrgueres, embalagens e publicações preservados. As fotos pequenas que representam corretamente o produto foram mantidas, sem inventar detalhes por ampliação artificial.
- Cartões com proporção 4:3, imagem inteira (`contain`), sem zoom que corte o alimento e sem escurecimento sobre a foto. Imagens novas identificadas como **Imagem ilustrativa**.
- Falha de carregamento deixa uma indicação neutra, em vez de apresentar outro prato escolhido aleatoriamente pela categoria.
- Os 59 WebP somam **4.25 MB**; nenhum ultrapassa 137 KB. A conversão apenas redimensiona e comprime, sem recortar ou alterar os alimentos.

## Arquivos e rastreabilidade

- [Imagens finais](../../public/menu/review-2026-09/).
- [Prompts finais e arquivos originais de geração](generated.json). Os IDs `refs` apontam para os produtos usados como referência, registrados em `catalog-before.json`.
- [Associações por produto](replacements.json), [catálogo anterior](catalog-before.json), [catálogo publicado](catalog-after.json) e [itens desativados](inactive-before.json).
- [Verificação HTTP e integridade dos arquivos publicados](live-verification.json).
- [SQL aplicado](apply.sql) e [SQL de reversão](rollback.sql). Ambos usam transação e conferem nome e URL esperada para não sobrescrever uma edição posterior do administrador.

Os itens com quantidades explícitas foram conferidos visualmente, incluindo quatro gouda, quatro anéis de cebola, seis mini churros e os componentes de cada combo. A marcação da garrafa do Combo 3 foi corrigida para 200 ml. O Combo TEX MEX ilustra duas opções de hambúrguer, chilli e tortilhas; os molhos cobrados como adicionais não foram incluídos na composição.

**Observação de cadastro:** o produto 132 se chama “Creme de Ovomaltine”, mas sua descrição menciona “Brigadeiro de Negresco”. A imagem segue o nome do produto; essa divergência textual foi preservada para conferência do responsável pelo cardápio. Itens sem descrição detalhada usam uma apresentação simples, sem prometer acompanhamentos ou recheios específicos.

## Publicação e validação

A produção recebeu os arquivos em `apps/web/public/menu/review-2026-09/`, as 102 atualizações de `products.image_url` e uma folha de estilos versionada (`menu-images-25605242331e1ab7.css`). A atualização visual foi aplicada ao bundle já publicado, por meio de `patch-deployed-image-css.mjs` e `presentation.css`; não houve reconstrução ou publicação das outras alterações em andamento no repositório.

`ProductCard.tsx` e `ProductImage.tsx` também incorporam o comportamento nas fontes para o próximo build. O controle de hidratação do cartão usa `useSyncExternalStore`, preservando a renderização inicial do carrinho.

Validações realizadas:

- Os **59 arquivos publicados** responderam com sucesso e SHA-256 idêntico ao arquivo local.
- API manteve **195 produtos**, com exatamente **100 URLs modificadas** entre os produtos visíveis e **nenhuma alteração nos outros campos**.
- Conferência visual dos combos no desktop e dos molhos em 390 × 844: imagens carregadas, `object-fit: contain`, identificação das ilustrações e largura do documento igual à viewport, sem rolagem horizontal.
- ESLint dos dois componentes alterados e TypeScript restrito aos componentes e suas dependências passaram. A execução ampla do TypeScript encontrou referências a `SelfServiceMenu` ausente nas rotas `/pedir` e `/totem`, fora destas alterações; essas rotas não foram publicadas nesta atualização.

Backup de produção: `/root/backups/barbacue-image-review-20260907/`, com `site-before.tgz`, `images-before.json`, SQL de reversão e o pacote publicado. Os manifests CSS anteriores também estão em `/root/barbacue/apps/web/image-css-backup-2026-09-07/`.

Para reproduzir a preparação das associações, com os WebP finais presentes, execute `node scripts/build-image-review.mjs` a partir de `apps/web`. `install-reviewed-images.mjs` é opcional e exige os originais locais indicados no registro de geração. O SQL de aplicação é destinado ao catálogo anterior registrado e aborta integralmente se houver divergências.
