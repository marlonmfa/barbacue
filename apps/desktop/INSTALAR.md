# Instalar Barbacue Pedidos no Windows

O programa reúne a administração completa do site: produtos, categorias, atendimento/WhatsApp, pedidos, cozinha, clientes, mesas, financeiro e demais funções, além da impressão automática das comandas. Requer Windows 10/11 de 64 bits e conexão com a internet. As telas ficam instaladas no computador; consultas e alterações vão diretamente à API online. O site e o programa usam os mesmos dados e acessos. Não exige Node.js nem banco de dados no computador. O driver da impressora só é necessário para imprimir.

## Atualizar a API online antes da versão 1.2.0

O responsável pelo servidor deve publicar a versão web correspondente. O programa tem telas locais e acessa a API online diretamente. Esta versão acrescenta `GET /api/admin/auth` para consultar a conta e as permissões atuais e `GET /api/admin/dashboard` para os indicadores; as outras operações usam os endpoints administrativos existentes. Não há alteração de banco nesta mudança. O instalador não publica nem modifica o servidor. Se a API de sessão estiver ausente, a interface informa a necessidade de atualização.

## Começar sem impressora

1. Execute **Barbacue-Pedidos-1.2.0-Windows-x64-Setup.exe** e conclua o assistente em português.
2. Abra **Barbacue Pedidos**. Confira o endereço `https://barbacue.cog.ia.br`, mantenha a impressão automática desmarcada e clique em **Salvar configuração**.
3. Clique em **Abrir administração** e entre com seu usuário e senha habituais. Se for o primeiro acesso, siga a troca de senha exigida pelo site.
4. Use a navegação do painel, a seleção **Ir para** ou os menus do programa. Os atalhos respeitam as permissões da conta: F2 pedidos, F3 atendimento/WhatsApp, F4 cozinha, F6 produtos/cardápios.

Não é necessária chave de impressão para cadastrar produtos, atender ou gerenciar pedidos. As integrações, como WhatsApp e iFood, precisam estar configuradas no servidor, assim como no site. Em **Impressoras e conexão**, configure a impressão quando precisar. As instruções abaixo se aplicam a esse recurso opcional.

## Preparar o servidor uma vez

O responsável pelo sistema deve publicar a versão web deste projeto com as migrations **0013_all_channel_printing** e **0017_restaurant_printers**, após as migrations anteriores, e atualizar o aplicativo dos computadores usados na impressão. A primeira inclui pedidos de novas origens na fila; a segunda permite escolher impressoras por restaurante. Nenhuma imprime o histórico. Os pedidos de totem e QR continuam no fluxo anterior, sem duplicação. Consulte [IMPRESSORAS.md](./IMPRESSORAS.md) para atualizar uma instalação existente. **O instalador Windows não publica nem modifica o servidor.**

Configure `PRINT_AGENT_TOKEN` no ambiente privado do servidor: um segredo aleatório de pelo menos 32 caracteres, sem espaços. A mesma chave será informada no programa. Antes de imprimir, o programa verifica se o servidor tem a atualização de todas as origens e informa quando ela está faltando. Não use a senha de login como chave, nem coloque esse segredo no instalador, em URLs ou no repositório. Se o servidor já tem essa chave configurada, mantenha o mesmo valor.

A aplicação do banco segue o procedimento de migrations adotado pela instalação. Em instalações gerenciadas pelo Drizzle, a partir da raiz do projeto:

```sh
npm run db:migrate --workspace=apps/web
npm run build --workspace=apps/web
```

Depois publique/reinicie o servidor pelo procedimento de implantação existente. Confira `/admin/orders` e `/admin/kitchen` antes de habilitar a impressão automática. Não execute migrations cegamente em uma base que foi criada com `db:push` e não tem histórico de migrations: concilie o histórico primeiro.

## Instalar no computador da loja

1. Execute **Barbacue-Pedidos-1.2.0-Windows-x64-Setup.exe**. Escolha a pasta e conclua o assistente em português. Há atalhos na área de trabalho e no menu Iniciar.
2. Abra **Barbacue Pedidos**. Informe o endereço HTTPS usado para abrir a loja no navegador, sem `/admin` no final.
3. Informe a chave de impressão fornecida pelo responsável pelo servidor. Use **Adicionar impressora no Windows** e **Atualizar lista** para instalar e reconhecer as impressoras. Se desejar uma impressora padrão, selecione-a e escolha o papel: bobina de **58 mm**, **80 mm** ou **A4**.
4. Salve e use **Imprimir teste**. Confira a leitura, as margens e o papel. Ajuste também o formato nas preferências do driver no Windows.
5. Use **Conectar impressoras ao painel** e **Mapear por restaurante** para escolher o destino e papel de Barbacue, Chelas e Barbadog. Marque **Imprimir novos pedidos automaticamente** e, se desejar, **Iniciar ao entrar no Windows**. Salve novamente.
6. Clique em **Abrir administração** e entre com seu usuário e senha habituais. As permissões da conta continuam valendo.

O instalador desta entrega não tem assinatura digital de editor. O Windows pode exibir um aviso de editor desconhecido. Para distribuição corporativa sem esse aviso, configure um certificado de assinatura ou o serviço de assinatura da organização no processo de geração.

## No atendimento

- Produtos, categorias, preços, imagens, adicionais e cardápios são gerenciados nas mesmas telas e salvos no mesmo servidor do site. Cadastros e alterações aparecem nos dois acessos.
- **Atendimento / WhatsApp** abre a central de conversas no programa. Mensagens e anexos seguem a integração existente. O acesso continua exclusivo dos perfis autorizados pelo servidor.
- Use **Voltar**, **Avançar** e **Atualizar** na barra superior. Se a API não responder, clique em **Tentar novamente** após recuperar a conexão ou use **Revisar conexão**. Confirme se uma operação foi registrada antes de reenviá-la.
- Imagens/arquivos podem ser selecionados no Windows; downloads e anexos usam a sessão online autenticada. Quando o atendimento solicitar microfone, o programa pede consentimento durante a sessão.
- O painel permite acompanhar pedidos, filtrar a origem, alterar etapas internas e organizar as entregas conforme o acesso do usuário.
- Os pedidos recebidos pelo sistema entram na fila automaticamente, incluindo site/aplicativo, WhatsApp/chat, fontes importadas e iFood quando a integração estiver configurada. A aplicação não acessa contas de marketplaces sem integração autorizada.
- Um pedido pendente sai com aviso **PEDIDO PENDENTE — CONFIRMAR**; impressão não comprova pagamento nem autorização para preparo. A situação de pagamento impressa corresponde ao recebimento do pedido.
- Para outras fontes, abra **Pedidos de outras fontes**, baixe o modelo JSON, preencha e importe. Até 50 pedidos por arquivo. A mesma combinação de origem, marca e identificador externo é ignorada em reenvios; um arquivo corrigido com o mesmo identificador não altera pedidos anteriores. Os valores estão em centavos. A importação exige acesso ao caixa.
- **Imprimir pedido** no detalhe mantém a impressão manual com diálogo do sistema, tanto no navegador quanto no programa. Use para segunda via; não reenvie uma comanda que já está aguardando na fila sem conferir o papel.
- Fechar o painel mantém o programa no ícone junto ao relógio. Use **Impressoras e conexão** na barra ou **Configurações e impressão** na bandeja para revisar a configuração. **Sair e parar impressão** encerra o programa.
- Sem internet, a gestão de pedidos depende de reconexão. Pedidos já recebidos pelo servidor permanecem na fila. Não há criação ou edição de pedidos offline.
- Falhas com envio incerto ficam para conferência na fila de cozinha. O sistema evita repetir automaticamente uma comanda que pode já ter saído. Um envio aceito pelo Windows não garante papel impresso.
- Evite suspensão do computador durante o atendimento. Vínculos por restaurante enviam os pedidos somente ao computador escolhido. Restaurantes em modo padrão continuam compartilhando a fila entre os agentes ativos, sem gerar cópias completas em cada computador.

## iFood

O conector do servidor agora registra os pedidos e as transições recebidas em `orders`. Configure as credenciais oficiais já previstas em `.env.example`, `DATABASE_URL` e, opcionalmente, `IFOOD_BRAND=barbacue` (ou `barbadog` / `chelas`). Execute o poller pelo procedimento existente. `IFOOD_DRY_RUN=true` não grava pedidos nem imprime. Pedidos agendados aguardam o horário de preparo para impressão; horários inválidos exigem conferência no iFood.

As ações locais do painel não enviam alterações de status ao iFood. Faça os comandos comerciais, cancelamentos e despacho externos pelo gestor iFood; o conector sincroniza as transições recebidas. A integração exige credenciais/homologação válidas; não foi conectada a uma conta real nesta entrega.

## Atualização e desinstalação

Para atualizar, encerre pelo menu **Sair e parar impressão** e execute o novo instalador. A configuração e o registro de impressão permanecem no perfil do usuário do Windows, em `%APPDATA%\Barbacue Pedidos`. A chave é protegida pelo armazenamento seguro do sistema e vinculada ao usuário; não copie a configuração para outro computador. O servidor, os pedidos e a versão web não são removidos ao desinstalar. O instalador preserva os dados locais para permitir uma reinstalação sem perder o registro de envios.

## Validação desta entrega

O instalador **1.2.0** foi gerado com as telas locais. Passaram os testes do desktop/agente, de permissões e o build web. A verificação em Electron real usa uma API de teste e confirma que nenhuma página online é carregada; inclui login, 24 módulos, alterações de produtos/pedidos, upload, reconexão, sessão e primeiro acesso. Consulte [VALIDACAO.md](./VALIDACAO.md) para evidências e limites. Nenhuma alteração foi publicada automaticamente no servidor. Instalação e impressão física ainda precisam ser conferidas em Windows real.
