# Frete por rota e navegação da entrega

O cliente calcula o frete para o endereço antes de confirmar uma entrega. O servidor localiza o destino com Nominatim e consulta uma **rota por vias** em OSRM, saindo da origem configurada da loja. Os dados vêm de OpenStreetMap. Não usa distância em linha reta, não recebe distância/preço do navegador e não transforma erro de mapas em frete zero.

A distância é a viagem de ida no perfil de carro. O tempo retornado é estimativa de deslocamento, sem preparo, espera ou retorno; não é uma promessa de prazo total. Links de navegação abrem o aplicativo escolhido, que pode recalcular outro caminho. A tarifa aceita no pedido permanece a cotada.

## Configuração

Aplicar a migration `0012_delivery_and_roles.sql` pelo mecanismo de migrations do projeto. Ela adiciona `delivery_settings`, `delivery_quotes` e os campos de entrega do pedido. O cálculo começa **desativado**, preservando o checkout existente. Enquanto estiver desativado, nenhum novo frete automático é cobrado; uma cotação enviada depois da desativação é rejeitada para o checkout atualizar suas condições.

Em `/admin/delivery-settings`, localizar o endereço de saída e configurar taxa de saída, valor por quilômetro, frete mínimo e distância máxima em quilômetros. O servidor guarda a distância em metros. O limite é medido pela rota, e não por um círculo em torno da loja. A ativação exige origem completa, coordenadas válidas, serviço OpenStreetMap configurado e pelo menos um componente de tarifa maior que zero.

Fórmula em centavos:

```text
frete = máximo(tarifa mínima,
               tarifa base + arredondar(distância em metros × tarifa por km / 1000))
```

Exemplo: rota de 3.750 m, base de R$ 3,00, R$ 1,20/km e mínimo de R$ 5,00 resulta em **R$ 7,50**. Não há arredondamento para quilômetros inteiros. Distância e duração do provedor são arredondadas para cima ao próximo metro/segundo. O cupom continua descontando produtos; o frete é somado depois. O valor informado para troco precisa cobrir esse total final.

As variáveis privadas estão no `.env.example` da raiz e precisam existir no ambiente runtime do servidor/PM2. Nenhuma é editada pelo navegador nem retornada em APIs:

| Variável | Uso |
| --- | --- |
| `DELIVERY_NOMINATIM_URL` | URL base de Nominatim próprio/contratado; `/search` é anexado |
| `DELIVERY_OSRM_URL` | URL base de OSRM próprio/contratado; `/route/v1/driving/...` é anexado |
| `DELIVERY_OSM_USER_AGENT` | Identificação descritiva da aplicação com contato da operação |
| `DELIVERY_PROVIDER_TIMEOUT_MS` | Prazo de cada chamada externa; padrão 8.000 ms, máximo 15.000 ms |

O indicador “configurado” verifica a presença/formato dessas opções, não saldo, acesso à API ou disponibilidade real. Localizar a origem pelo painel exercita o provedor com os valores definidos.

## Provedores

**OpenStreetMap:** Nominatim recebe o endereço completo, com busca restrita ao Brasil, e OSRM recebe coordenadas em `longitude,latitude`. O backend usa a distância e a duração da rota retornada por OSRM. Não há endpoint público padrão: uma instalação própria ou contrato deve fornecer as duas URLs. Em produção, os hosts públicos de demonstração conhecidos são recusados. A busca segue o [contrato do Nominatim](https://nominatim.org/release-docs/latest/api/Search/) e a rota segue o [contrato do OSRM](https://project-osrm.org/docs/v5.24.0/api/).

As consultas Nominatim são espaçadas em um segundo por processo, identificadas por User-Agent e usam cache de geocodificação em memória por 15 minutos, com até 500 endereços. Consultas simultâneas do mesmo endereço compartilham a mesma requisição. Esses limites não substituem as condições do provedor contratado; a [política do serviço público Nominatim](https://operations.osmfoundation.org/policies/nominatim/) é uma razão para não usá-lo como infraestrutura automática de produção. Exibir a origem dos dados como OpenStreetMap/OSRM junto às informações de rota.

**Google Maps e Apple Maps:** disponíveis para navegação pelo link do pedido, usando as coordenadas obtidas pelo fluxo OpenStreetMap. A implementação escolhe OpenStreetMap para o cálculo e não solicita chave Google nem faz chamadas às APIs pagas Google. Isso mantém os snapshots e a escolha do aplicativo de navegação coerentes com a origem dos dados. O operador configura a retenção dos endereços e cotações conforme a necessidade da loja; não há rotina automática de expurgo nesta etapa.

URLs externos vêm exclusivamente do ambiente do servidor. Não são aceitos no pedido ou na configuração administrativa. Redirecionamentos externos são recusados, respostas são limitadas a 256 KB e há até quatro requisições simultâneas por instância de provedor. Erros retornados ao cliente nunca incluem URL privada, chave ou resposta bruta do provedor. O cache e o limite de consultas são por processo, compatíveis com a instância única atual; operação com vários processos precisa coordenar limites no provedor/gateway.

## Contratos HTTP

- `GET /api/delivery/quote` retorna somente `{enabled}` e não faz geocodificação.
- `POST /api/delivery/quote` recebe `{address,brand}` e retorna `201` com `{quoteId,address,distanceMeters,durationSeconds,feeCents,expiresAt,routeLinks:{google,apple,osm},provider}`. Aceita corpo de até 4 KB e 30 consultas/minuto/IP. O endereço retornado é o texto fornecido pelo cliente sanitizado; o endereço formatado pelo provedor não altera a identidade da cotação.
- `GET /api/admin/delivery-settings` retorna `{settings,providers:{osm:{configured}}}`. `PUT` recebe a configuração completa sem `id` ou `updatedAt`, com `provider:"osm"`. Ambos exigem permissão `settings`.
- `POST /api/admin/delivery-settings/geocode` recebe `{address,provider}` e retorna `{address,latitude,longitude}`, também com permissão `settings` e limite de 15 buscas/minuto/IP.

A origem/endereço não precisa ser digitada em latitude/longitude pelo cliente. Resultados geográficos amplos, como centro de cidade ou rua sem localização precisa, são rejeitados com instrução para completar rua, número, bairro e cidade. Uma localização disponível no mapa não garante que a rota seja atendida: a verificação de rota e distância vem depois.

Falhas distinguem endereço não localizado, rota inexistente, área excedida, configuração ausente, mudança de configuração e provedor indisponível. Desativação retorna `409 delivery_disabled` ao cotar; checkout com cotação desativada retorna `422 delivery_disabled`. Campos inválidos retornam 422, excesso de corpo 413 e limite de frequência 429. Timeout/erro remoto retorna 503 e permite nova tentativa; não confirma a entrega sem cotação.

## Persistência e integridade

A cotação vale **15 minutos** e fica vinculada à marca e ao endereço normalizado. A comparação tolera caixa, acentos e espaços, preservando números, complemento e pontuação. O navegador envia apenas `deliveryQuoteId` junto ao endereço/pedido: o servidor carrega valor, distância, duração e links do banco. ID inexistente, endereço/marca diferente ou cotação vencida são rejeitados.

Uma mudança apenas na tarifa mantém a cotação já apresentada durante sua validade. Mudança de configuração enquanto o serviço consulta a rota interrompe a nova cotação para recalcular. Nenhuma transação fica aberta durante a chamada de mapas; antes de gravar, o serviço revalida a configuração sob trava de leitura. O snapshot de cotação não é alterado por APIs. No pedido, frete e dados da rota são copiados na mesma transação dos produtos, cupom e cliente. A mesma cotação pode atender mais de um pedido do mesmo endereço/marca durante a validade; ela não é uma chave de idempotência de pedido.

Pedidos na mesa não recebem frete. Se tentarem enviar uma cotação junto com um pedido de mesa, a API pede atualização. A integração automática com a fila de cozinha do autoatendimento permanece separada do checkout de entregas.

## Canais de atendimento

O checkout web e o aplicativo móvel consultam se o cálculo está ativo, apresentam a cotação antes da confirmação e enviam `deliveryQuoteId`. Alterar endereço ou marca, ou deixar a cotação expirar, exige novo cálculo. Se o provedor ficar indisponível, o cliente precisa tentar novamente ou escolher retirada; o canal não ignora a tarifa para enviar a entrega. O simulador administrativo `TestOrderChat` também calcula antes de criar um pedido de entrega.

No WhatsApp, o bot calcula antes do envio, mostra quilômetros, frete e total estimado, e exige a mensagem exata **CONFIRMAR ENTREGA**. Mudanças no pedido/endereço ou expiração da cotação renovam a etapa de confirmação. Sem cotação válida, o bot não registra a entrega. O servidor continua sendo a autoridade final de preço, cupom e validade em todos os canais.

Os links usam os contratos de [Google Maps URLs](https://developers.google.com/maps/documentation/urls/guide) e [Apple Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html). O link OpenStreetMap abre direções de carro com a origem e o destino do snapshot.

## Testes sem serviços pagos

Na pasta `apps/web`:

```sh
node --test src/lib/__tests__/delivery.test.ts tests/delivery-provider.test.mjs
node tests/fake-delivery-provider.mjs
```

O segundo comando serve somente fixtures em `127.0.0.1:3199`: localização de teste, rota de 3.750 m e 660 segundos. Não acessa provedores reais. Configure o servidor Next de teste com as duas URLs OSM apontando para esse endereço, User-Agent descritivo e timeout de 1.000 ms. Os testes de transporte usam servidores HTTP em loopback com portas aleatórias.

Depois de aplicar migrations em um banco local **descartável com `delivery_test` no nome** e iniciar Next usando esse banco:

```sh
DELIVERY_TEST_URL=http://127.0.0.1:3099 \
DATABASE_URL=postgresql://USUARIO@localhost:5432/barbacue_delivery_test_20260908 \
ADMIN_PASSWORD=SENHA_DO_SERVIDOR_LOCAL \
node tests/delivery.integration.mjs
```

O script cria fixtures identificados, altera/restaura temporariamente configurações da entrega/loja e remove seus pedidos, cupons, clientes e cotações no `finally`. Não executá-lo simultaneamente com testes visuais no mesmo banco. O controle do fake em `/__test/config` aceita somente o segredo de teste local (`FAKE_DELIVERY_SECRET`), permitindo simular área, rota inexistente, timeout e HTTP 503. O fake não deve ser implantado em produção.

Validação em 08/09/2026: **8 testes unitários/de transporte e 75 verificações da API de frete aprovados**, incluindo vínculo ao endereço/marca, validade, cupom, troco com frete, rollback do cupom, compatibilidade de mesa e checkout desativado. Também passaram 107 verificações de operação por função, 19 verificações visuais do checkout, 25 testes do aplicativo e 14 testes do bot. O build de produção, com TypeScript e geração de páginas, e o ESLint dos arquivos envolvidos passaram. Mapas foram simulados em servidor local; não houve chamada a provedor de produção nem impressão física nesta validação.

O bot de WhatsApp inclui testes de cotação, confirmação e perda de resposta. Quando não consegue saber se o servidor recebeu um pedido, bloqueia o reenvio desse carrinho e orienta conferir com a equipe. A opção `NOVO PEDIDO` começa outro carrinho, após essa orientação; não repete o anterior. A proteção de conversa é em memória e não substitui idempotência persistida do endpoint legado de pedidos.

O teste `tests/delivery-checkout.visual.mjs` exercita configuração de origem/tarifa, cotação, mudança de endereço, troco e gravação do pedido com o frete. Produz capturas em `test-screenshots/` na raiz. Execute com `BASE` e `DATABASE_URL` apontando para o servidor e o banco locais de teste.

Revisão visual: **PASS** nas 10 capturas de 08/09/2026 (perfis, configuração, checkout web e aplicativo). Textos, controles, valores e navegação renderizaram sem cortes indevidos ou sobreposição. Capturas registradas no commit `7c7506b` e inspecionadas após o commit.
