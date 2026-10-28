# Pedidos online em /pedir

A página recebe pedidos de Barbacue, Barbadog e Chelas, com os cardápios já
importados e mantidos no banco. O usuário autorizou esse catálogo em 24/10/2026:
a aplicação iFood autenticou, mas as três consultas do módulo Catálogo deram
HTTP 403. Esta entrega não altera produtos nem preços para simular sincronização.

O domínio escolhe a marca inicial; `?restaurante=barbacue|barbadog|chelas` permite
abrir uma marca diretamente. O seletor segue Chelas, Barbacue e Barbadog. Um QR
válido ou uma sessão de mesa conserva o destino na mesa; sem mesa, há retirada.
Entrega só aparece quando o frete está habilitado e exige cotação válida do
restaurante e do endereço. O total do Pix inclui o frete.

## Pagamento e produção

1. O navegador guarda um identificador de envio e uma capacidade aleatória na
   sessão da aba antes do POST. O servidor valida CPF, telefone, itens, mesa,
   horário e cotação, busca preços no banco e grava um pedido online pendente.
2. O cliente Asaas segue o padrão usado no E26: referência externa estável,
   notificações de cliente desativadas e nenhum POST financeiro repetido após
   timeout ou resultado incerto. A referência é `barbacue:order:<UUID>`.
3. O marcador de tentativa é confirmado no banco antes da emissão. Se a resposta
   se perder, uma consulta por referência recupera a cobrança existente. Se não
   for encontrada, a equipe deve conferir no Asaas; não há reemissão automática.
4. O Pix dinâmico apresenta QR Code e copia e cola. A consulta periódica e o
   webhook consultam a API do Asaas antes de considerar o pagamento confirmado.
   ID, cliente, referência, método e valor precisam corresponder ao pedido.
5. `CONFIRMED` ou `RECEIVED` libera o pedido: pagamento `paid`, etapa `confirmed`
   e uma única comanda são persistidos na mesma transação. Falha da fila
   desfaz a liberação e o callback responde 503 para permitir nova entrega.
6. A cozinha e o painel impedem avanço e impressão de pedido online não pago.
   Preparo e pronto são acompanhados pela mesma confirmação do cliente.

O webhook exige `asaas-access-token` próprio, aceita repetições e ignora
cobranças de outros projetos da conta compartilhada. Não confia no status vindo
do corpo da notificação. Também recupera o identificador da cobrança quando o
callback chega antes da resposta da emissão. A consulta periódica é uma segunda
via de verificação; o webhook permite confirmar mesmo com a aba fechada.

A capacidade de consulta nunca vai na URL nem na listagem administrativa. CPF
é enviado ao Asaas e removido do armazenamento da aba assim que o pagamento
pode ser recuperado por ID; não há coluna de CPF na aplicação. O corpo original
fica temporariamente na sessão da aba enquanto uma emissão está incerta.

O cliente pode cancelar uma cobrança ainda não paga. O servidor confere o Asaas
antes de removê-la e somente depois fecha o pedido. Pagamento concorrente ao
cancelamento impede um cancelamento local indevido. Pagamento de um pedido já
cancelado exige conferência e eventual estorno pela equipe; não reabre a cozinha.
Estornos confirmados deixam pagamento `failed`; pedidos pendentes/confirmados
são cancelados, e pedidos em preparo exigem decisão operacional da equipe.
Não são executados estornos financeiros automaticamente.

## Configuração

- `ASAAS_ENVIRONMENT=sandbox|production`, com sandbox como padrão.
- `ASAAS_API_KEY`: apenas no ambiente do servidor. Produção usa a conta indicada
  pelo usuário, com o cliente de referência do E26.
- `ASAAS_WEBHOOK_TOKEN`: segredo aleatório próprio, no mínimo 32 caracteres.
- `ASAAS_WEBHOOK_EMAIL`: e-mail operacional opcional; o configurador usa
  `COGMAIL_MAILBOX` como alternativa.
- Endpoint público: `https://barbacue.cog.ia.br/api/webhooks/asaas`.

O standalone de produção recebe ambiente do PM2. O Compose encaminha as mesmas
variáveis. Não colocar chaves no código, no cliente ou no contexto Docker.

`node apps/web/scripts/configure-asaas-webhook.mjs` consulta a configuração.
Com `--apply`, cria ou atualiza somente a URL desta integração, preservando os
outros webhooks. A operação não cria cobrança. Após timeout, a listagem da URL
recupera a configuração antes de tentar criar novamente.

Referências oficiais: [Pix dinâmico](https://docs.asaas.com/docs/cobrancas-via-pix),
[configuração de webhook](https://docs.asaas.com/docs/criar-novo-webhook-pela-api),
[eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas).

## Verificação

- `node_modules/.bin/tsx --test apps/web/tests/online-payment.test.ts`.
- `DATABASE_URL=postgresql://.../barbacue_online_test_<identificador>
  node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json
  apps/web/tests/online-checkout.integration.ts` (um banco local descartável,
  vazio, com esquema atual e migrações 0013 e 0018).
- Integração usa PostgreSQL real e Asaas simulado, sem tráfego financeiro real.
  Abrange 12 envios concorrentes, webhook repetido/forjado, preço canônico,
  falha da impressão com rollback, recuperação por referência, timeout sem
  repetição financeira, cancelamento, mesa, restaurantes, frete e fechamento.

## Implantação de 24/10/2026

Base: build `tj6YNAphSh5BmbsaEUV5L`, fonte preservada da atualização de login
individual. O pacote do checkout conserva essas fontes e aplica apenas esta
funcionalidade; os rascunhos locais de configuração de impressoras não fazem
parte do pacote web. Migrações 0017 (estruturas aditivas de impressão, sem mudar
rotas operacionais) e 0018 (checkout e exclusão do canal online do gatilho de
impressão imediata) mantêm a sequência de migrações reproduzível.

Backup do aplicativo, dump verificado do banco e ambiente privado:
`/root/deploy-backups/barbacue-online-20261024`. Aplicação sob PM2 no container
`otherpagesandig`, SSH `91.108.125.60:2212`, porta interna 3007. A publicação
não troca imagem Docker, banco, volumes, contas, senhas ou arquivos operacionais.

Publicado: build `vFPgH7G29sn-SJgE1G1AT`, dist `.next-online-20261024`.
Webhook Asaas `8729a78c-70db-4b0e-9a1c-e30550016285`, habilitado e sem
interrupção. Conferência do candidato: 31 verificações, 108 rotas preservadas,
5 contas, 135 pedidos, 197 produtos Barbacue e 137 produtos das outras marcas
preservados. Os testes não criaram cobranças reais. A versão anterior está em
`/root/barbacue-before-online-20261024`.

Validação local: 12 testes unitários/regressão, 37 verificações da integração
com banco isolado e Asaas simulado, 16 verificações HTTP e fluxo no Chrome em
desktop e celular. A conferência pública e o manifesto da fonte estão no backup
como `public-verification.json` e `release-manifest.json`.

Rollback do aplicativo: parar somente o PM2 `barbacue`, preservar o diretório
atual, restaurar o diretório anterior para `/root/barbacue` e reiniciar. Não
restaurar dump por cima de pedidos novos. As tabelas aditivas podem permanecer.
Se o checkout for desativado, revisar a fila de pagamentos e interromper somente
este webhook; não alterar integrações do E26 ou de outros projetos.
