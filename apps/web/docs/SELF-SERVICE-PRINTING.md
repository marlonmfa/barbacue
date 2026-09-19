# Pedidos do totem/QR e impressão na cozinha

**Atualização Windows e todas as origens:** consulte `apps/desktop/INSTALAR.md`. A versão desktop inclui impressão pelas filas instaladas no Windows. Com a migration `0013_all_channel_printing`, pedidos novos de outras origens também entram na fila (ticket versão 2); o fluxo de totem/QR abaixo continua válido (versão 1). Atualize agentes antigos antes de aplicar essa migration.

O navegador do tablet/celular cria o pedido no servidor. A mesma transação grava uma tarefa na fila de impressão. Um **print-agent local**, no computador da loja com acesso à impressora existente, busca a fila por HTTPS e envia a comanda à impressora. O computador deve ficar ligado, conectado à rede e sem suspensão durante o atendimento.

O tablet e o celular não precisam instalar driver, acessar a rede da impressora ou abrir a caixa de diálogo de impressão. Pedidos já aceitos pelo servidor permanecem na fila quando o agente ou a impressora ficam indisponíveis. Sem conexão com o servidor, o navegador não deve informar que enviou um novo pedido.

## Abrir o autoatendimento

- `/totem`: tablet compartilhado no balcão, com nome para retirada.
- `/totem?mesa=TOKEN_DA_MESA`: tablet fixo em uma mesa cadastrada.
- `/mesa/TOKEN_DA_MESA`: endereço dos QRs existentes; passa a abrir `/pedir` com a mesa identificada. QRs já impressos continuam válidos.
- `/admin/tables`: cadastrar mesas, imprimir QRs e abrir os links de tablet.
- `/admin/kitchen`: acompanhar preparo, conexão do agente e fila de impressão; a permissão de cozinha protege essas ações.

O catálogo respeita a marca do domínio atual (Barbacue, Barbadog ou Chelas). Estes pedidos não pedem login, telefone ou endereço. O cliente escolhe cartão ou dinheiro **no local**, e o pedido entra como confirmado para preparo, com pagamento pendente. Essa confirmação não comprova pagamento. A impressão automática atende os novos canais `kiosk` e `table_qr`; os pedidos dos canais anteriores mantêm o fluxo existente.

No tablet, o atendimento concluído reinicia após 25 segundos. Um carrinho abandonado recebe aviso após três minutos e é limpo 30 segundos depois. Envios sem resposta não são apagados por esse temporizador: somente o pedido pendente fica no `sessionStorage` da aba para recuperar o mesmo identificador após atualizar a página; ele é removido quando o servidor confirma o resultado. O servidor grava pedido e tarefa de impressão na mesma transação e impede duplicação pelo identificador de envio, inclusive em reenvios simultâneos.

## Compatibilidade a confirmar na loja

Ainda é necessário confirmar **marca/modelo, largura do papel, conexão e sistema operacional do computador que imprime hoje**. Não foi realizada impressão física nesta implementação.

| Impressora existente | Caminho preparado | Configuração necessária |
| --- | --- | --- |
| USB ou outra conexão, já instalada no macOS/Linux | CUPS, comando `lp` | Nome exato da fila, driver e tamanho de papel configurados |
| Impressora de rede com ESC/POS sobre TCP | Conexão TCP, porta padrão 9100 | IP estável e compatibilidade ESC/POS confirmada no manual |
| USB instalada no Windows | Aplicativo Barbacue Pedidos | Instalar o driver, selecionar impressora e papel nas configurações do programa |
| Impressora de rede no Windows | TCP ESC/POS | Node.js e IP da impressora; não usa a fila USB do Windows |

`PRINT_CUPS_FORMAT=text` usa a fila/driver existente para processar texto. Ajuste o papel e as margens nas opções dessa fila. `PRINT_CUPS_FORMAT=escpos` envia bytes ESC/POS por CUPS em modo `raw`; use apenas em modelo compatível e numa fila que aceite esses bytes. O uso da fila instalada, USB incluído, segue o [manual de impressão do CUPS](https://www.cups.org/doc/options.html); o comando recebe conteúdo por stdin e identifica o destino com `-d` conforme o [manual do lp](https://www.cups.org/doc/man-lp.html).

O modo TCP envia texto ASCII, inicialização ESC/POS e avanço de papel. Acentos são normalizados (`porção` → `porcao`) para evitar depender da página de caracteres de um modelo desconhecido. Textos de produtos e observações têm caracteres de controle removidos e quebra em 32 ou 48 colunas. O corte automático fica **desativado** por padrão; `PRINT_CUT=true` habilita `GS V 0` somente após conferir suporte no [manual ESC/POS do fabricante](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/). A biblioteca não envia comandos de gaveta, beeper ou dados de entrega.

## Servidor

1. Aplicar `apps/web/drizzle/migrations/0011_self_service_printing.sql` pelo mecanismo de migrations da aplicação e configurar o `.env.example` da raiz do monorepo. A migration adiciona o tipo de pedido `pickup`, os campos de idempotência em `orders`, a fila `kitchen_print_jobs` e o último contato em `kitchen_print_agent_state`.
2. Gerar uma única vez um segredo aleatório, por exemplo com `openssl rand -hex 32` no computador responsável pela instalação.
3. Configurar `PRINT_AGENT_TOKEN` no ambiente privado do servidor e o mesmo valor no `.env` do agente local. O segredo deve ter pelo menos 32 caracteres, sem espaços. Não usar prefixo `NEXT_PUBLIC_`, QR code, URL pública, JavaScript do cliente ou repositório para esse token.
4. Reiniciar o servidor após configurar suas variáveis. Use HTTPS fora de localhost. O agente rejeita HTTP remoto e redirecionamentos para não transmitir o segredo para outro destino.

A API autenticada pelo segredo usa:

- `POST /api/print-agent/jobs/claim` → `{ job: { id, leaseToken, leaseExpiresAt, ticket } | null }`.
- `POST /api/print-agent/jobs/{id}/complete` com `{ leaseToken }` confirma **submissão** ao transporte.
- `POST /api/print-agent/jobs/{id}/fail` com `{ leaseToken, error, uncertain }` registra falha antes do envio ou envio incerto.

A reserva de 120 segundos impede dois agentes de receberem a mesma tarefa simultaneamente. O agente não inicia envio se restarem menos de 65 segundos. Os timeouts de API e transporte ficam limitados a 30 segundos cada. Reservas expiradas e envios incertos exigem revisão; não presumem que a comanda deixou de sair.

## Instalar e validar sem impressora

Exige Node.js 22.9 ou mais recente. O workspace não instala dependências adicionais. Execute na raiz do monorepo (`barbacue/`):

```sh
npm test --workspace=@barbacue/print-agent
npm run preview --workspace=@barbacue/print-agent
npm start --workspace=@barbacue/print-agent
```

Sem `.env`, `start` usa `dry-run`, mostra uma mensagem e encerra. **Dry-run não consulta, reserva, envia nem confirma tarefas reais.** Ele não retira pedidos da fila nem marca pedidos como impressos. O comando `preview` formata somente o arquivo fictício `apps/print-agent/examples/ticket.json` e escreve no terminal.

Para visualizar outro ticket local:

```sh
cd apps/print-agent
node src/index.mjs preview examples/ticket.json
```

Os testes usam diretórios temporários, processos falsos e um receptor TCP em loopback com porta aleatória. Nenhum teste acessa impressoras ou a produção. Cobrem quebra de texto, sanitização, reserva, timeout, exclusão mútua, persistência, reinício e resposta de confirmação perdida.

## Configurar na loja

Copie o exemplo e preencha o segredo localmente, sem compartilhá-lo em mensagens:

```sh
cd apps/print-agent
cp .env.example .env
chmod 600 .env
```

Para reaproveitar a fila do macOS/Linux, consulte seu nome com `lpstat -p -d` e configure:

```dotenv
PRINT_TRANSPORT=cups
PRINT_API_URL=https://SEU-DOMINIO
PRINT_AGENT_TOKEN=COLE_O_MESMO_SEGREDO_PRIVADO_DO_SERVIDOR
PRINT_CUPS_PRINTER=NOME_DA_FILA_EXISTENTE
PRINT_CUPS_FORMAT=text
PRINT_COLUMNS=48
PRINT_CUT=false
```

Para rede TCP, após conferir o protocolo do modelo:

```dotenv
PRINT_TRANSPORT=tcp
PRINT_API_URL=https://SEU-DOMINIO
PRINT_AGENT_TOKEN=COLE_O_MESMO_SEGREDO_PRIVADO_DO_SERVIDOR
PRINT_TCP_HOST=192.168.1.50
PRINT_TCP_PORT=9100
PRINT_COLUMNS=48
PRINT_CUT=false
```

Mantenha as demais opções do `.env.example`. Configure `PRINT_STATE_DIR` com diretório **local persistente**, acessível apenas ao usuário do agente. Para serviço, prefira caminho absoluto. Não use diretório temporário, sincronizado em nuvem ou compartilhado entre computadores. Reserve o IP da impressora no roteador. A porta TCP da impressora deve continuar acessível apenas à rede local.

Depois de configurar o transporte real, `npm start --workspace=@barbacue/print-agent` **começa a consumir a fila e pode imprimir pedidos reais existentes**. A primeira validação física deve ocorrer na loja, com a cozinha acompanhando o resultado de uma comanda identificada e sem confundi-la com pedidos em atendimento. Não houve ativação ou impressão física automática durante o desenvolvimento.

## Inicialização automática

A exclusão mútua usa a porta `127.0.0.1:9178`; o sistema operacional a libera após saída ou crash. Uma segunda instância no mesmo computador encerra sem reservar pedidos. Não troque `PRINT_LOCK_PORT` para executar cópias paralelas para a mesma fila. Se a porta estiver ocupada por outro programa, escolha outra porta uma vez e mantenha-a em todas as configurações desse computador.

No Linux, exemplo de unidade `/etc/systemd/system/barbacue-print-agent.service` (ajuste os caminhos/usuário e confirme `command -v node`):

```ini
[Unit]
Description=Barbacue - fila de comandas da cozinha
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=operador
WorkingDirectory=/opt/barbacue/apps/print-agent
ExecStart=/usr/bin/node --env-file=/opt/barbacue/apps/print-agent/.env /opt/barbacue/apps/print-agent/src/index.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=90
UMask=0077

[Install]
WantedBy=multi-user.target
```

Depois da configuração e da validação física na loja, o responsável pode habilitar a unidade com `sudo systemctl enable --now barbacue-print-agent`. Consulte logs com `journalctl -u barbacue-print-agent -f`. O usuário do serviço precisa das mesmas permissões para a fila CUPS que o operador usa hoje.

No macOS, use LaunchAgent do usuário que já imprime. Configure `WorkingDirectory` para `apps/print-agent`, `ProgramArguments` com o caminho absoluto do Node, `--env-file=/caminho/.env` e `src/index.mjs` absoluto; `RunAtLoad=true`, `KeepAlive` com `SuccessfulExit=false`, `ThrottleInterval=5`, `ExitTimeOut=90`, e caminhos para stdout/stderr. No Windows com TCP, o Agendador de Tarefas pode iniciar os mesmos argumentos de Node, com a pasta do agente em “Iniciar em” e reinício após falha. Em qualquer sistema, mantenha o mesmo diretório de estado entre reinícios e desative a suspensão do computador no expediente.

`SIGTERM`/`Ctrl+C` impedem o próximo ciclo, deixam o envio atual terminar dentro dos timeouts e liberam o lock. Um encerramento abrupto é recuperado pelo diário no próximo início.

## Operação e recuperação

A comanda contém marca, identificador do pedido, mesa ou balcão, origem, horário, quantidades, observações de cada item e do pedido. Destaca **PAGAMENTO PENDENTE / Pagar no local** e identifica reimpressões. Ela é uma comanda de preparo e não contém endereço, telefone ou comprovante de pagamento.

“Enviado” significa que `lp` aceitou a tarefa no spool ou que o socket entregou os bytes ao sistema operacional. **Não é confirmação de saída física do papel**; papel acabou, tampa aberta, impressora desligada após aceitação ou fila pausada ainda podem impedir impressão. Essa distinção corresponde à semântica de envio dos [sockets do Node.js](https://nodejs.org/api/net.html). Confirme a comanda na cozinha ao investigar falhas.

O diário grava `intent` e sincroniza em disco **antes** de enviar bytes. Ao concluir o envio, grava `submitted` **antes** de confirmar ao servidor. Se a resposta do servidor se perder, o agente repete apenas a confirmação; ele não repete papel. Se reiniciar com `intent`, reporta envio incerto e aguarda revisão. No Windows, os arquivos são sincronizados, mas `fsync` de diretório não está disponível; para a durabilidade mais forte, prefira o host macOS/Linux.

| Situação | Comportamento / ação |
| --- | --- |
| Agente desligado ou sem internet | Pedidos aceitos ficam no servidor; reiniciar com o mesmo estado local |
| Conexão recusada antes de enviar | Falha conhecida; servidor pode reagendar com backoff |
| Timeout/erro depois de iniciar envio | Estado incerto; conferir papel e spool antes de autorizar nova tentativa |
| CUPS recebeu, mas não saiu papel | Conferir fila com `lpstat -o`, papel, tampa, driver e impressora; não reimprimir enquanto o spool puder liberar a original |
| ACK perdido | Agente recupera `submitted` e repete apenas a confirmação |
| Processo encerrado no meio do envio | Diário `intent` vira incerto; revisão antes de reimprimir |
| HTTP 401/403 | Conferir segredo privado do servidor/agente e reiniciar após correção |
| HTTP 409 na recuperação | Reserva substituída no servidor (por exemplo, retry manual); tentativa antiga é arquivada sem novo envio e a fila continua. Conferir reimpressão com a equipe |
| Erro de disco/journal | Corrigir permissão/espaço e recuperar o diário; não apagar arquivos para forçar reimpressão |

No painel administrativo, conferir o pedido e o estado da impressão antes de usar a ação de tentar novamente/reimprimir. Para estado incerto, confirmar que a original não saiu e não está aguardando liberação no spool. Reimpressão é uma decisão do operador e pode duplicar preparo se não houver essa conferência.

Registros substituídos por novo lease (`superseded`) também são preservados. Os registros concluídos ficam em `PRINT_STATE_DIR/archive/` e os pendentes na raiz. O histórico contém identificadores, lease e estado de envio, sem conteúdo dos itens/endereço. Proteja e preserve esse diretório; não o apague nem rode duas máquinas com cópias independentes do estado para resolver uma falha. Ao migrar o agente de computador, pare o anterior e copie o estado completo antes de iniciar o novo. Rotacione o token no servidor e no agente em conjunto, fora do processamento de tarefas.

## Contrato do pedido e monitoramento

`POST /api/self-service/orders` recebe `requestId` UUID, `channel` (`kiosk` ou `table_qr`), `brand`, `paymentMethod` (`cash` ou `card_on_delivery`), `items` (`productId`, `qty`, `notes` opcional), `customerName` e `notes` opcionais. `table_qr` exige `tableToken` ativo; totem sem mesa exige nome de pelo menos dois caracteres para retirada. O servidor revalida produto, preço, disponibilidade e horário de atendimento. São permitidas até 40 linhas, 20 unidades por linha e 100 unidades no pedido; o corpo HTTP aceita até 20 KB. Um limite por processo de 60 novos envios/minuto/IP acompanha o modelo de instância única atual; reenvios de pedidos aceitos não entram nesse limite.

O servidor responde `201` com `{orderId, orderType, tableNumber, totalCents, items, status:"confirmed", printStatus:"queued"}`. Pagamento permanece pendente e nenhum cadastro fictício de cliente é criado. A resposta `queued` confirma que a tarefa foi gravada, mesmo se o agente estiver desligado. Manter o mesmo `requestId` e conteúdo após falha de rede: retorna `200` com a resposta original e `Idempotent-Replayed:true`, inclusive após fechamento da loja ou rotação do QR. Alterar conteúdo mantendo a mesma chave resulta em `409`. Chaves, conteúdo normalizado e resposta são persistidos; uma trava transacional e a restrição única protegem reenvios concorrentes. A API de pedidos legada mantém o comportamento existente.

`GET /api/admin/kitchen/printing` exige a permissão `kitchen` e apresenta configuração, último contato, estado online (contato nos últimos 60 segundos), total pendente, até 100 pendências antigas primeiro e 20 submissões recentes. Não expõe token, telefone, valores ou observações. `POST` no mesmo endereço recebe `{jobId,acknowledgePossibleDuplicate:true}` e recoloca somente `failed`/`uncertain` na fila, sinalizando reimpressão. Pedidos cancelados não são reivindicados nem reenviados manualmente. Cancelar um pedido já enviado não retira o papel/spool: alinhar a interrupção com a cozinha.

Falha comprovada antes de envio pode repetir com espera de 5, 10, 20 e 40 segundos; após cinco tentativas fica `failed`. Expiração da reserva sempre exige revisão, mesmo se uma falha conhecida chegar atrasada. Um comprovante persistido de submissão pode confirmar uma reserva `uncertain` com o mesmo `leaseToken`; uma reimpressão manual invalida esse token anterior. Os ACKs de conclusão e falha são idempotentes para a mesma reserva.

## Validação do backend

Os testes de API precisam de **banco local descartável com `self_service_test` no nome**, migrations aplicadas e servidor Next local usando o mesmo banco/segredos. Executar em `apps/web`, ajustando os valores locais abaixo:

```sh
npx tsx --test src/lib/__tests__/self-service.test.ts tests/self-service-pending.test.ts
SELF_SERVICE_TEST_URL=http://127.0.0.1:3098 \
DATABASE_URL=postgresql://USUARIO@localhost:5432/barbacue_self_service_test_20260907 \
ADMIN_PASSWORD=SENHA_DO_SERVIDOR_DE_TESTE \
PRINT_AGENT_TOKEN=TOKEN_DO_SERVIDOR_DE_TESTE_COM_32_CARACTERES \
node tests/self-service.integration.mjs
```

A integração altera temporariamente horário e produtos de teste, cria clientes de teste da equipe e restaura/remove seus fixtures no `finally`. Tarefas já existentes no banco descartável são postergadas temporariamente durante o teste de reivindicação e restauradas ao final. Não executar junto com testes visuais ou com um agente consumindo essa fila. A suíte cobre preços canônicos, 12 reenvios concorrentes (incluindo UUID com letras maiúsculas), rollback quando a fila falha, QR inativo/rotacionado, recuperação após fechamento, autorização, concorrência de reservas, falhas conhecidas/incertas, ACK tardio/idempotente, revisão de reimpressão e cancelamento. Validação realizada em 07/09/2026: quatro testes unitários e 102 verificações de API aprovados, sem usar impressora física.

### Fluxo completo até o transporte local

`apps/web/tests/self-service-print.e2e.mjs` comprova uma única cadeia real: pedido HTTP → PostgreSQL → `PrintAgent`/API/journal → socket TCP → receptor de teste em loopback → confirmação HTTP → estado `printed` no servidor. Esse estado representa submissão, sem afirmar saída física do papel. A execução validou **32 verificações**, incluindo mesa, preço canônico, observações, pagamento pendente, normalização de acentos, remoção de comandos de controle e uma única tentativa.

Execute a partir de `apps/web`, sem outro teste/agente consumindo a fila:

```sh
SELF_SERVICE_TEST_URL=http://127.0.0.1:3098 \
DATABASE_URL=postgresql://USUARIO@localhost:5432/barbacue_self_service_test_LOCAL \
PRINT_AGENT_TOKEN=SEGREDO_PRIVADO_DO_SERVIDOR_DE_TESTE \
node tests/self-service-print.e2e.mjs
```

O script recusa servidor/banco externos e exige `self_service_test` no nome do banco. A loja local deve estar aberta; o teste não altera configurações ou horários. Cria produto, mesa e pedido próprios, adia temporariamente tarefas já enfileiradas e restaura seu agendamento no `finally`, removendo somente suas fixtures e seu journal temporário. O destino TCP é fixado no receptor `127.0.0.1` com porta aleatória, ignorando configurações de impressora do ambiente; não usa CUPS ou hardware real.

### Interface e recuperação após atualizar a página

Em `apps/web`, use o mesmo servidor/banco descartável (sem executar as integrações anteriores simultaneamente):

```sh
BASE=http://127.0.0.1:3098 \
DATABASE_URL=postgresql://USUARIO@localhost:5432/barbacue_self_service_test_LOCAL \
SELF_SERVICE_TEST_PASSWORD=SENHA_DO_SERVIDOR_DE_TESTE \
node tests/self-service.visual.mjs
```

O teste mantém um cardápio de demonstração no banco descartável e salva seis capturas em `test-screenshots/`. Cobre tablet, QR da mesa, carrinho, observações, preço recalculado, preparo na cozinha e uma resposta perdida seguida de atualização da página e recuperação do mesmo pedido. As 24 verificações passaram; a revisão visual aprovou leitura, fotos, identificação da mesa e botões de envio acessíveis no tablet e no celular. O build de produção e os testes de recuperação do envio também passaram.
