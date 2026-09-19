# Instalar Barbacue Pedidos no Windows

O programa reúne o painel de gestão e a impressão automática das comandas. O site continua funcionando no navegador e compartilha os mesmos pedidos e acessos. Requer Windows 10/11 de 64 bits, conexão com a internet e driver da impressora instalado. Não exige instalar Node.js ou um banco de dados no computador da loja.

## Preparar o servidor uma vez

O responsável pelo sistema deve publicar a versão web deste projeto com a migration **0013_all_channel_printing**, após as migrations anteriores, e atualizar qualquer agente antigo de impressão. A migration inclui pedidos de novas origens na fila; não imprime o histórico. Os pedidos de totem e QR continuam no fluxo anterior, sem duplicação. **O instalador Windows não publica nem modifica o servidor.**

Configure `PRINT_AGENT_TOKEN` no ambiente privado do servidor: um segredo aleatório de pelo menos 32 caracteres, sem espaços. A mesma chave será informada no programa. Antes de imprimir, o programa verifica se o servidor tem a atualização de todas as origens e informa quando ela está faltando. Não use a senha de login como chave, nem coloque esse segredo no instalador, em URLs ou no repositório. Se o servidor já tem essa chave configurada, mantenha o mesmo valor.

A aplicação do banco segue o procedimento de migrations adotado pela instalação. Em instalações gerenciadas pelo Drizzle, a partir da raiz do projeto:

```sh
npm run db:migrate --workspace=apps/web
npm run build --workspace=apps/web
```

Depois publique/reinicie o servidor pelo procedimento de implantação existente. Confira `/admin/orders` e `/admin/kitchen` antes de habilitar a impressão automática. Não execute migrations cegamente em uma base que foi criada com `db:push` e não tem histórico de migrations: concilie o histórico primeiro.

## Instalar no computador da loja

1. Execute **Barbacue-Pedidos-1.0.0-Windows-x64-Setup.exe**. Escolha a pasta e conclua o assistente em português. Há atalhos na área de trabalho e no menu Iniciar.
2. Abra **Barbacue Pedidos**. Informe o endereço HTTPS usado para abrir a loja no navegador, sem `/admin` no final.
3. Selecione a impressora e o papel: bobina de **58 mm**, **80 mm** ou **A4**. Informe a chave de impressão fornecida pelo responsável pelo servidor.
4. Salve e use **Imprimir teste**. Confira a leitura, as margens e o papel. Ajuste também o formato nas preferências do driver no Windows.
5. Marque **Imprimir novos pedidos automaticamente** e, se desejar, **Iniciar ao entrar no Windows**. Salve novamente.
6. Clique em **Abrir pedidos** e entre com seu usuário e senha habituais. As permissões da conta continuam valendo.

O instalador desta entrega não tem assinatura digital de editor. O Windows pode exibir um aviso de editor desconhecido. Para distribuição corporativa sem esse aviso, configure um certificado de assinatura ou o serviço de assinatura da organização no processo de geração.

## No atendimento

- O painel permite acompanhar pedidos, filtrar a origem, alterar etapas internas e organizar as entregas conforme o acesso do usuário.
- Os pedidos recebidos pelo sistema entram na fila automaticamente, incluindo site/aplicativo, WhatsApp/chat, fontes importadas e iFood quando a integração estiver configurada. A aplicação não acessa contas de marketplaces sem integração autorizada.
- Um pedido pendente sai com aviso **PEDIDO PENDENTE — CONFIRMAR**; impressão não comprova pagamento nem autorização para preparo. A situação de pagamento impressa corresponde ao recebimento do pedido.
- Para outras fontes, abra **Pedidos de outras fontes**, baixe o modelo JSON, preencha e importe. Até 50 pedidos por arquivo. A mesma combinação de origem, marca e identificador externo é ignorada em reenvios; um arquivo corrigido com o mesmo identificador não altera pedidos anteriores. Os valores estão em centavos. A importação exige acesso ao caixa.
- **Imprimir pedido** no detalhe mantém a impressão manual com diálogo do sistema, tanto no navegador quanto no programa. Use para segunda via; não reenvie uma comanda que já está aguardando na fila sem conferir o papel.
- Fechar o painel mantém o programa no ícone junto ao relógio. Use **Configurações e impressão** para pausar ou revisar a conexão. **Sair e parar impressão** encerra o programa.
- Sem internet, a gestão de pedidos depende de reconexão. Pedidos já recebidos pelo servidor permanecem na fila. Não há criação ou edição de pedidos offline.
- Falhas com envio incerto ficam para conferência na fila de cozinha. O sistema evita repetir automaticamente uma comanda que pode já ter saído. Um envio aceito pelo Windows não garante papel impresso.
- Evite suspensão do computador durante o atendimento. Ative um único consumidor da fila por loja; dois computadores imprimindo dividirão os pedidos entre eles, não gerarão cópias completas em ambos.

## iFood

O conector do servidor agora registra os pedidos e as transições recebidas em `orders`. Configure as credenciais oficiais já previstas em `.env.example`, `DATABASE_URL` e, opcionalmente, `IFOOD_BRAND=barbacue` (ou `barbadog` / `chelas`). Execute o poller pelo procedimento existente. `IFOOD_DRY_RUN=true` não grava pedidos nem imprime. Pedidos agendados aguardam o horário de preparo para impressão; horários inválidos exigem conferência no iFood.

As ações locais do painel não enviam alterações de status ao iFood. Faça os comandos comerciais, cancelamentos e despacho externos pelo gestor iFood; o conector sincroniza as transições recebidas. A integração exige credenciais/homologação válidas; não foi conectada a uma conta real nesta entrega.

## Atualização e desinstalação

Para atualizar, encerre pelo menu **Sair e parar impressão** e execute o novo instalador. A configuração e o registro de impressão permanecem no perfil do usuário do Windows, em `%APPDATA%\Barbacue Pedidos`. A chave é protegida pelo armazenamento seguro do sistema e vinculada ao usuário; não copie a configuração para outro computador. O servidor, os pedidos e a versão web não são removidos ao desinstalar. O instalador preserva os dados locais para permitir uma reinstalação sem perder o registro de envios.

## Validação desta entrega

O instalador `.exe` foi gerado. Os testes cobrem configuração, isolamento do painel, filas, falhas, reenvios, importação simultânea e fontes diferentes em banco local isolado. A versão web passou no build de produção. A impressão física e a execução do instalador em Windows real ainda precisam ser conferidas no computador da loja. A aplicação web e a migration estão preparadas no projeto; não foram publicadas automaticamente no servidor da loja.
