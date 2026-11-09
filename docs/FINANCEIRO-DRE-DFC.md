# DRE e fluxo de caixa (`/admin/financeiro`)

Painel gerencial do grupo (Barbacue, Chelas e Barbadog). O formato segue o DRE de Caixa do
JCanedo: árvore de contas que abre e fecha, colunas por loja com consolidado, ou mês a mês,
clique na célula para ver os lançamentos (drill-down) e exportação em CSV. Só administradores
acessam (`permissions.ts`: `financeiro → admin`).

## Abas
- **Visão geral**: receita bruta, receita líquida, resultado, caixa gerado, gráfico de 6 meses,
  resultado por loja, ponto de equilíbrio, comissão iFood e contas em aberto ou vencidas.
- **DRE**: regime de competência.
- **Fluxo de caixa (DFC)**: regime de caixa, método direto.

## Fontes de dados
| Dado | Origem |
|---|---|
| Vendas | `orders`: pedido próprio aceito ou pedido iFood, exceto cancelados e testes |
| Custos, despesas, pagamentos e recebimentos | `erp_finance` (exceto cancelados). Compras recebidas e folha já geram lançamento |

O cálculo é puro e roda no navegador, em `src/lib/financeiro/engine.ts`. A leitura do banco
fica em `src/lib/financeiro/queries.ts`. Os testes estão em `tests/financeiro-engine.test.ts`
(unitário) e `tests/financeiro.visual.mjs` (navegador, só com banco local).

## Plano de contas (categoria do lançamento → linha)
| Categoria (`erp_finance.category`) | DRE | DFC |
|---|---|---|
| purchase (insumos) | CMV | Fornecedores |
| packaging | Despesas variáveis · Embalagens | Fornecedores |
| delivery | Despesas variáveis · Entregas | Entregas, taxas e marketing |
| marketplace (comissão iFood) | Deduções · Comissão iFood | Entregas, taxas e marketing |
| fees (cartão/Pix) | Deduções · Taxas de cartão | Entregas, taxas e marketing |
| tax | Deduções · Impostos sobre vendas | Impostos |
| payroll | Fixas · Folha | Folha |
| rent / utilities / maintenance | Fixas | Aluguel, contas e manutenção |
| marketing / admin / operating | Fixas | Entregas…/Administrativo |
| financial | Resultado financeiro | Financiamentos · Tarifas e juros |
| other | Outras receitas/despesas | Administrativo e outras |
| investment | — (não é resultado) | Investimentos |
| loan | — | Empréstimos recebidos/pagos |
| withdrawal | — | Retirada dos sócios |
| ifood (a receber) | — | Repasses iFood (real) |
| sales (a receber) | Outras receitas de vendas | Outros recebimentos |

## Premissas
1. **Competência**: um lançamento entra no mês de `competence` ou, se ela estiver vazia, no
   mês do vencimento. Venda entra na data do pedido (fuso de São Paulo).
2. **Comissão iFood estimada: 15,2%** (Plano Básico: 12% de comissão + 3,2% de pagamento
   online). A escolha vem dos fechamentos em planilha do Takeout, que mostram motoboy próprio.
   A taxa pode ser ajustada na tela. Quando existe lançamento `marketplace` no mês e na loja,
   ele substitui a estimativa. Valor estimado aparece com "≈".
3. **Repasse iFood estimado**: os pedidos de segunda a domingo são pagos na quarta-feira
   seguinte, já com a taxa descontada. Pedido iFood pago na entrega fica com a casa (entra
   em dinheiro ou cartão), e a taxa dele sai do repasse. Quando existe repasse real
   (`ifood` a receber, baixado) no mês e na loja, ele substitui a estimativa.
4. **Saldo inicial** do DFC é a soma do que o sistema registrou antes do período. Ainda não
   existe saldo bancário de abertura.
5. **Ponto de equilíbrio** = despesas fixas ÷ % de margem de contribuição sobre a receita
   bruta. Com margem de contribuição negativa, o ponto não é atingível.

## Limitações conhecidas (09/11/2026)
- Em produção, `erp_finance` está vazio. Até os lançamentos começarem, o DRE mostra só
  vendas, descontos e a comissão estimada.
- Os pedidos no sistema começam em 27/05/2026 e só ganham volume em outubro/2026. Em outubro
  são cerca de R$ 39 mil, contra perto de R$ 140 mil por mês nos fechamentos em planilha.
  Para o histórico de 2023–2026 entrar no painel, é preciso importar os fechamentos do
  Takeout (proposta em `secrets/takeout-2026-11-07/INVENTARIO.md`, ainda não aprovada).
