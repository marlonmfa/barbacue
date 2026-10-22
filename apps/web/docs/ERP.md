# ERP do Grupo Barbacue

O painel `/admin/erp` está disponível aos administradores. A API também verifica a sessão e o papel em cada acesso. Funcionários, salários e escalas existentes permanecem em `/admin/team`.

## Fluxos disponíveis

- Fornecedores: cadastro, edição e inativação.
- Insumos: kg, litro ou unidade; custo, saldo e estoque mínimo compartilhados entre as marcas. Quantidades são inteiros em milésimos e valores são inteiros em centavos.
- Compras: rascunho editável, recebimento e cancelamento de rascunhos. O recebimento lança estoque, custo médio ponderado e conta a pagar numa única transação.
- Receitas: fichas vinculadas à identidade dos itens dos três cardápios, descrição original, rendimento, insumos, quantidades, preparo e revisão. Fichas aprovadas permitem registrar lotes produzidos com consumo de estoque; saldo insuficiente desfaz a operação inteira. Custos e percentual sobre o preço são calculados com os custos atuais dos insumos.
- Financeiro: contas a pagar/receber, vencimentos, atrasos, competência, referência documental, baixa com data e comprovante, cancelamento de lançamentos manuais abertos e exportação CSV. Compras e folhas não precisam ser relançadas.
- Impostos: cadastro manual da obrigação, guia/referência, competência, vencimento e registro de pagamento já realizado.
- RH: folha por funcionário e competência, salário-base do cadastro, adicionais/descontos conferidos e conta a pagar; ponto manual com intervalo e suporte a turnos noturnos; férias, atestados e afastamentos. Períodos sobrepostos são recusados.
- Histórico: operações e usuário responsável; o banco guarda também o comando para rastrear alterações. Repetir uma requisição com o mesmo identificador e conteúdo não repete lançamentos.

## Importação e instalação

A migração `0014_handy_gamora.sql` é aditiva e cadastra as fichas dos produtos Barbacue do banco, dos catálogos gerenciados e dos snapshots Barbadog/Chelas. A identidade do produto impede duplicação e as fichas existentes não são sobrescritas. No painel, **Importar novos itens do cardápio** incorpora novos produtos sem apagar revisões.

O cardápio não fornece uma ficha técnica completa. As descrições são preservadas como referência; ingredientes estruturados, quantidades e modo de preparo devem ser conferidos pela cozinha. As fichas começam como **Revisar ficha**, sem custo calculado ou autorização para consumo de estoque.

Para instalações com histórico de migrações completo, use `npm run db:migrate --workspace=web`. Em instalações anteriores que aplicaram SQL manualmente e têm o esquema até 0013, execute na raiz:

```sh
node apps/web/scripts/migrate-erp.mjs
```

Esse instalador aplica apenas a migração ERP, registra seu hash no histórico do Drizzle e importa o catálogo na mesma transação. Não reaplica migrações antigas. Pode ser executado novamente sem duplicar fichas. Usa `DATABASE_URL`, com fallback para o `.env` da raiz; não publica a aplicação nem transfere dinheiro.

## Limites operacionais

- Pagamento bancário, emissão de guias, apuração tributária, NF-e/NFC-e, eSocial e cálculo legal de folha não estão integrados. Valores e obrigações vêm da contabilidade; a baixa confirma um pagamento realizado fora do sistema.
- O ponto é um controle administrativo manual, não um registrador eletrônico certificado.
- A produção é registrada manualmente; pedidos não consomem estoque automaticamente. Não existe ainda gestão por lote/validade, devolução de compra recebida, conciliação bancária, pagamento parcial ou estorno de baixa. Corrigir esses lançamentos imutáveis requer um fluxo adicional; não os duplique para tentar corrigi-los.
- O resumo mostra valores acumulados, não uma DRE contábil. Pedidos pagos aparecem separados do caixa dos lançamentos para evitar dupla contagem. A validade dos pagamentos de pedidos segue o sistema de pedidos existente.
- A folha lançada é única por funcionário/competência. Confira os valores antes de lançar; não há cálculo automático de rescisão, férias, 13º ou encargos.
- Movimentações mostram os últimos 200 registros, ponto os últimos 500 e histórico as últimas 100 operações. Os registros anteriores permanecem no banco.

## Verificação

`tests/erp.integration.mjs` exige um servidor local apontando para banco descartável com todas as migrações. Usa `ERP_TEST_URL` e `ERP_TEST_PASSWORD`; jamais execute contra o banco operacional. Cobre autenticação, isolamento de funções, recebimento concorrente, estoque insuficiente, idempotência, importação, impostos, folha, sobreposições de ponto/afastamento e datas inválidas.

Foram aprovados 47 testes de integração, TypeScript, ESLint dos arquivos novos, build de produção e inspeção de navegador em desktop e celular. A instalação local importou 334 fichas (197 Barbacue, 71 Barbadog e 66 Chelas), com cobertura de todos os produtos existentes no banco e reexecução sem duplicação. Publicado em produção em 20/09/2026. A rodada ampliada aprovou 599 verificações contadas; consulte [o relatório de validação e publicação](ERP-VALIDATION-2026-09-20.md).
