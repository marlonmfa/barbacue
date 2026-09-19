# Perfis, contas e permissões

- `/`: visitante acessa o cardápio e as ofertas para visitantes/todos. Funcionários autenticados são encaminhados à área de trabalho. “Ver loja” abre `/?loja=1`.
- `/conta`: cadastro e entrada por e-mail/senha para clientes da casa; não concede acesso de funcionário. O cadastro histórico de pedidos não equivale a uma conta autenticada. O cookie de preenchimento de pedido não concede ofertas exclusivas.
- `/admin/login`: entrada da equipe e do administrador mestre existente.
- `/admin/staff`: administrador cria contas, escolhe perfil, informa cargo opcional, ativa/desativa contas e define funções individuais. O filtro “Quem pode” mostra as contas com a função selecionada (o status indica se estão ativas).
- `/admin/workspace`: atalhos somente para as funções permitidas; explica quando nenhuma foi liberada.
- `/admin/kitchen`: fila de pedidos confirmados, em preparo e prontos. Permite apenas confirmado → em preparo → pronto, sem dados de contato ou valores. Atualização a cada 15 segundos, com até 100 pedidos ativos, mais antigos primeiro.
- `/admin/coupons`: cada cupom pode atender todos, apenas visitantes ou apenas clientes da casa. O público é validado também na criação do pedido, dentro da reserva atômica do cupom.

## Modelo

`src/lib/permissions.ts` centraliza catálogo, navegação e permissões iniciais. Administrador tem acesso integral; gerente recebe as funções operacionais; caixa recebe pedidos e mesas; cozinha recebe preparo; funcionário genérico inicia sem funções. `permissions = null` mantém os padrões do perfil; `[]` remove todas as funções. A lista individual substitui os padrões, sem somá-los.

## Áreas por função

| Perfil | Tela inicial padrão | Trabalho principal |
| --- | --- | --- |
| Administrador | `/admin` | Operação geral, equipe, acessos e configurações |
| Gerente | `/admin` | Operação geral, pedidos, salão, cardápio e funcionamento |
| Caixa | `/admin/orders` | Confirmar pedidos e atribuir entregadores |
| Cozinha | `/admin/kitchen` | Iniciar o preparo e marcar pedidos prontos |
| Garçom | `/admin/waiter` | Acompanhar mesas, lançar pedidos e registrar que foram servidos |
| Entregador | `/admin/delivery` | Retirar, navegar e concluir somente as entregas atribuídas à sua conta |
| Funcionário | `/admin/workspace` | Funções liberadas individualmente pelo administrador |

A tela inicial prioriza a função do perfil somente quando essa permissão continua liberada. Se ela for revogada, o sistema abre outra função permitida ou “Meu trabalho”; nunca redireciona de volta a uma página bloqueada. Nome e cargo aparecem na identificação da área de trabalho. A navegação e as APIs usam o mesmo catálogo de permissões.

As novas permissões são `floor` (Salão) e `deliveries` (Minhas entregas). Gerentes podem configurar entrega e frete em `/admin/delivery-settings` com a permissão `settings`. Cadastrar ou alterar usuários permanece restrito ao administrador. Um funcionário com acesso adicional a uma função não recebe automaticamente acesso às demais.

### Salão

`GET /api/admin/waiter` retorna as mesas ativas e seus links de pedido, além de pedidos para consumo na mesa em andamento. Mostra marca, mesa, itens, quantidades, observações e preparo; omite telefone, endereço, preço e dados financeiros do cliente. O acesso para lançar pedido usa o mesmo token público do QR da mesa, sem permitir administrar os QRs.

“Marcar como servido” aceita apenas um pedido `dine_in` cujo preparo esteja `ready`. A atualização condicional muda o pedido para `delivered` e registra a conclusão; repetição ou pedido de entrega/retirada é rejeitado. Pagamento não é alterado. A tela atualiza automaticamente a cada 15 segundos.

### Atribuição e entrega

1. No caixa, abra o detalhe de um pedido de entrega e escolha o entregador. A lista aceita apenas contas ativas com perfil `driver` e permissão `deliveries`. A atribuição não altera o preparo da cozinha.
2. O entregador recebe somente os pedidos atribuídos à sua própria conta. São mostrados destino, telefone, quantidade de itens, observação, frete incluído no total, valor a cobrar e links de navegação. Não há uma lista pública de pedidos sem entregador nem acesso às rotas de outros funcionários.
3. Quando o pedido está pronto (`orders.status = ready`), “Iniciar entrega” muda `deliveryStatus` de `assigned` para `out_for_delivery` e registra `dispatchedAt`.
4. Após entregar ao cliente, “Concluir entrega” muda `deliveryStatus` e o status geral para `delivered`, registrando `deliveredAt`. O entregador não pode alterar o estado do pagamento: a confirmação financeira pertence ao caixa. Se o pedido já está pago, o valor a cobrar mostrado é zero.

O caixa pode trocar ou remover o entregador antes da saída. Remover a atribuição limpa apenas a etapa de entrega. Depois da saída, a troca é bloqueada. Cancelamentos e finalizações são conferidos no servidor, assim como identidade, tipo de pedido e etapa anterior. O entregador vê conclusões próprias por 24 horas; cancelados ficam fora da sua fila.

Pedidos com cotação mantêm os links de rota calculados. Pedidos antigos sem coordenadas usam o endereço real da loja e da entrega em Google Maps e Apple Maps. OpenStreetMap aparece somente quando existe uma rota com coordenadas; o sistema não inventa coordenadas ou destinos.

Um cargo específico é descritivo e não aumenta privilégios. Qualquer quantidade de contas pode receber a mesma função. Administração de contas, RH, integrações e impersonação permanecem restritos ao administrador. O próprio administrador não pode rebaixar ou desativar sua conta. O login mestre continua disponível.

O servidor consulta a conta atual em cada solicitação protegida: revogações e desativações valem para sessões já abertas. Proxy e handlers verificam o catálogo; novas rotas administrativas sem mapeamento são negadas. Ao implementar uma nova função, adicione sua definição e mapeamento ao catálogo, e use os guards nos handlers.

## Banco e instalação

Aplique as migrações antes de iniciar esta versão:

```sh
npm run db:migrate --workspace=apps/web
```

O journal inclui as migrações já existentes 0007–0009 e a nova `0010_access_permissions.sql`, que amplia os perfis, adiciona cargo/permissões, cria contas de clientes e adiciona público aos cupons. As novas colunas são compatíveis com contas existentes (permissões padrão e cupons para todos).

A migração `0012_delivery_and_roles.sql` acrescenta os perfis garçom/entregador e os campos da operação de entrega. Deve ser aplicada antes de disponibilizar as novas contas e páginas.

A entrada de clientes usa `ADMIN_COOKIE_SECRET` (mínimo 16 caracteres), assinatura própria para clientes, cookie HttpOnly e senha com scrypt. Contas de cliente são independentes dos registros de pedidos e de RH. Este caso de uso básico ainda não oferece recuperação de senha nem verificação de e-mail.

## Verificação

```sh
node --test apps/web/src/lib/__tests__/permissions.test.ts
npm run build --workspace=apps/web
```

Teste de integração contra uma instância e um PostgreSQL locais descartáveis, já migrados:

```sh
ACCESS_TEST_URL=http://localhost:3097 \
ACCESS_TEST_PASSWORD='<senha mestre do servidor de teste>' \
DATABASE_URL='<URL do PostgreSQL local de teste>' \
node apps/web/tests/access.integration.mjs
```

O teste cria dados fictícios no banco local. Verifica isolamento de funções, redirecionamento, revogação em sessão aberta, privacidade da fila de preparo, transições válidas e descontos por público, inclusive pedidos diretos sem passar pela interface de cupons.

Teste integrado das áreas por função, atribuição e conclusão, com capturas de tela:

```sh
ROLE_TEST_URL=http://127.0.0.1:3099 \
ROLE_TEST_PASSWORD='<senha mestre do servidor local de teste>' \
DATABASE_URL='<URL do PostgreSQL local descartável com test no nome>' \
node apps/web/tests/role-operations.integration.mjs
```

Esse teste cria e remove suas próprias contas, mesas e pedidos; não altera horários ou configurações de frete. Valida isolamento entre entregadores, recusa a acessos e estados indevidos, revogação de permissões em sessão ativa, privacidade dos dados e interfaces de gerente, caixa, cozinha, garçom e entregador. As capturas ficam em `test-screenshots/papel-*.png`.
