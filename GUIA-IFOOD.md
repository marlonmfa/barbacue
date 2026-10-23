# Conectar Chelas, Barbacue e Hotdog ao iFood

## Estado confirmado em 22/10/2026 (America/Sao_Paulo)

As três lojas já concederam **ORDER e EVENTS** ao Food COG. O monitor está
`running`, `healthy`, `state=monitoring` e importando pedidos reais.

| Marca | Pedidos importados na verificação |
|---|---:|
| Barbacue | 53 |
| Chelas | 12 |
| Hotdog / Barbadog | 4 |

Total: 69 pedidos. Um pedido recente de cada marca foi comparado à Order API:
merchant, valor total, nomes dos itens e quantidades conferiram nas três lojas.
Consultas somente de leitura; nenhum pedido foi criado, confirmado ou cancelado.

Pendências distintas do recebimento:

- **Impressão:** 69 jobs em `queued`, nenhum com tentativa; não houve confirmação
  de impressão física nesta verificação. Conectar/validar o agente de impressão.
- **Status e pausa das lojas:** falta autorização do módulo Merchant. ORDER/EVENTS
  já funcionam; o Gestor iFood está publicado em `/admin/ifood` conforme
  [documentação](apps/web/docs/IFOOD-GESTOR.md).

O Portal do Parceiro foi reaberto no Chrome na tela de login para o responsável.
As autorizações de ORDER/EVENTS não precisam ser reenviadas.


A integração existente em `packages/ifood` foi adaptada para monitorar as três
lojas e importar pedidos para `/admin/orders`, com o canal **iFood** e a marca correta.

| Loja | Merchant ID |
|---|---|
| Chelas | `991532f5-0400-4efe-b38a-b2b37f8bd9b0` |
| Barbacue | `403af0c6-176b-4021-a6cd-3e09dca09cbf` |
| Hotdog (Barbadog no sistema) | `6cb73c63-55cd-459b-a02b-aa936967bf20` |

1. No [iFood Developer](https://developer.ifood.com.br/), abra a aplicação
   **Food COG** (`19e6ca56-1a7a-483d-b28b-c945990154c7`). Verifique módulos Events/Order e
   autorização individual das três lojas.
2. As credenciais do Food COG já foram reutilizadas no `.env` local do Barbacue.
   No host de execução, configure essas duas variáveis sem alterar os demais ambientes.
   Não envie segredos por chat nem versione o arquivo.
3. Deixe `IFOOD_MERCHANT_ID` e `IFOOD_MERCHANTS_JSON` vazios para usar o mapeamento
   das três lojas e execute `npm run doctor --workspace=packages/ifood`.
4. Valide o monitor com `IFOOD_DRY_RUN=true`. Polling estabelece presença da loja
   no iFood; coordene a ativação com qualquer consumidor já existente.
5. Confira o banco operacional e então defina `IFOOD_DRY_RUN=false` para importar.
   A confirmação comercial permanece no gestor iFood por padrão.
6. Ative o serviço `ifood-monitor` no host atual conforme o
   [manual do conector](packages/ifood/README.md). Preserve ambientes, contas e volumes.
7. Gere pedidos de teste das três lojas e confira a marca, itens, pagamentos,
   transições de status e impressão no painel antes de validar a operação real.

O conector não cria aplicação no portal nem concede acesso às lojas. A conexão real
precisa das credenciais e das autorizações. O manual descreve build reproduzível,
serviço contínuo, diagnóstico e limites operacionais.

## Publicação em 18/10/2026 (America/Sao_Paulo)

- Credenciais da aplicação Food COG reutilizadas; autenticação HTTP 200.
- Solicitações das três lojas registradas no portal, com ORDER/EVENTS em
  **Waiting Activation** e webhook habilitado. Não foram reenviadas.
- Correção de roteamento publicada no Food COG para impedir mistura com Granni.
  Granni continua ACTIVE, sem erro de sincronização; banco, volumes e ambientes preservados.
- Monitor Docker publicado no host atual do Barbacue, separado do web/PM2 e usando
  o banco nativo existente. Processo rodando e healthcheck healthy.
- Estado operacional: `waiting_authorization` para Chelas, Barbacue e Hotdog.
  Verifica permissões a cada minuto e começa a importar quando as três estiverem liberadas.
  Confirmação automática permanece desligada.
- 15 testes do Barbacue e três de roteamento Food COG aprovados, além de TypeScript
  e builds das imagens. Nenhum pedido de teste foi criado em produção.
- Portal do Parceiro aberto no Chrome: precisa do login da conta administradora
  das lojas para concluir a ativação. Depois, observar pedidos reais das três marcas.

Detalhes do serviço, imagem e operação no [manual](packages/ifood/README.md).
