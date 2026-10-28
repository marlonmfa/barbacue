# Barbacue Pedidos — desktop Windows

## Administração local e API online (1.2.0)

Aplicativo instalável para Windows 10/11 x64 com os mesmos módulos da área administrativa. As telas React são compiladas e incluídas no instalador. O processo principal envia as solicitações diretamente à API HTTPS online, usando a sessão HttpOnly da conta da equipe. Não carrega HTML ou JavaScript do site para apresentar a administração. Dados, regras de negócio e autorização continuam no servidor; não há servidor HTTP nem banco de dados local. Requer internet e a atualização da API publicada.

- Operação: meu trabalho, visão geral, caixa e pedidos, atendimento/WhatsApp, gestor iFood, cozinha, salão, entregas e teste de pedidos.
- Cardápios: produtos e cardápios por marca, cadastro de produtos, categorias, ofertas e cupons.
- Gestão: ERP/financeiro, mesas/QR codes, clientes, funcionários, usuários/permissões, loja/horários e entrega/frete.
- Sistema: beta, integrações, programa Windows e acessos.

A barra do aplicativo oferece seleção de função, voltar, avançar, atualização, estado da conexão e configurações das impressoras. Os menus nativos expõem as mesmas funções. F2 abre pedidos, F3 atendimento, F4 cozinha, F6 cardápios e F5 atualiza. O servidor verifica o acesso em cada tela; um atalho não concede uma permissão.

Para administrar, basta salvar o endereço e entrar com a conta habitual. A chave e a impressora são opcionais, necessárias apenas para os recursos de impressão automática. Downloads e anexos usam a mesma sessão online, sem expor cookies ou chaves ao renderer. Gravação de áudio solicita consentimento para o microfone durante a sessão do programa. Em falhas de conexão, a interface local permite tentar novamente; o transporte não repete gravações automaticamente.

Consulte [INSTALAR.md](./INSTALAR.md) para instalação e operação.

Para parear impressoras e escolher o destino de cada restaurante, consulte [IMPRESSORAS.md](./IMPRESSORAS.md).

## Desenvolvimento e build

Na raiz do monorepo:

```sh
npm ci
npm run desktop
npm run test:desktop
npm run desktop:windows
```

Saída: `apps/desktop/release/Barbacue-Pedidos-1.2.0-Windows-x64-Setup.exe`.

A compilação copia o agente compartilhado para `vendor/print-agent` (não versionado). Electron, React, CSS, telas administrativas e agente de impressão são incluídos no instalador. O backend permanece online e não há dependência de Node.js na máquina final. O workflow `windows-desktop.yml` gera instalador e SHA-256 por execução manual ou tag `desktop-v*`. O pacote não contém senhas ou `.env`.

## Arquitetura

- `src/main.mjs`: processo principal, registro do protocolo local seguro, IPC restrito, configuração, bandeja, armazenamento protegido e impressão.
- `src/workspace.mjs`: janela administrativa servida exclusivamente de arquivos locais pelo protocolo `barbacue-app://desktop`; mantém `sandbox`, `contextIsolation` e `webSecurity` ativos. A navegação administrativa não abre páginas remotas.
- `src/api-client.mjs`: transporte para a API online, limitado a rotas/métodos conhecidos e imagens raster. Usa cookies da partição online, sem repassá-los ao renderer, rejeita redirecionamentos/HTML, limita uploads e aplica timeout. Não reenvia mutações automaticamente.
- `renderer/`: aplicação React local, adaptadores de navegação/imagens e wrappers para as telas que antes dependiam de renderização no servidor.
- `scripts/build-renderer.mjs`: compila os componentes administrativos compartilhados, CSS Modules e Tailwind; bloqueia imports de banco e código de servidor no bundle. QR codes apontam para a origem online. O pedido de balcão/mesa também usa a API online.
- `src/modules.mjs`: catálogo dos 24 módulos, usado pela seleção de funções e menus nativos. Um teste verifica cobertura de todos os links do `AdminShell` e existência das páginas no site.
- `src/workspace-preload.cjs`: ponte restrita da barra local; aceita somente módulos e comandos conhecidos, com validação de origem e frame no processo principal.
- `src/settings.mjs`: validação de configuração e navegação. A chave não é retornada ao renderer. Trocar o servidor exige informar uma nova chave.
- `src/preload.cjs`: ponte restrita da configuração; `workspace-preload.cjs` expõe apenas navegação e estado da janela administrativa. A API usa transporte nativo e não entrega cookies ao renderer.
- `src/printing.mjs`: spool via driver instalado (`getPrintersAsync` / `webContents.print`); HTML escapado, timeout e tratamento conservador de falhas incertas.
- `apps/print-agent`: journal durável, leases, prevenção de duplicação e confirmação ao servidor; compartilhado com os transportes CUPS/TCP existentes.
- `0013_all_channel_printing.sql`: trigger transacional para novas origens. Totem/QR continuam criando a tarefa pela transação existente. A identidade única por pedido impede duplicação.
- `apps/web/src/app/api/admin/orders/import`: importação autenticada com validação, limite de tamanho e identidade determinística por origem/ID/marca.

O journal separa servidores pelo hash da origem. O bloqueio do processo e a porta de exclusão mútua impedem duas instâncias no mesmo computador. O servidor também usa reserva exclusiva. Os históricos do journal devem ser preservados junto com as configurações em reinstalações.

## Testes

```sh
npm run test:desktop
npm test --workspace=@barbacue/ifood
node --test apps/web/tests/imported-orders.test.ts
npm run build --workspace=apps/web
```

O teste `apps/web/tests/desktop-print.integration.mjs` só aceita servidor e banco de teste em loopback, com `desktop_test` no nome. Requer esquema atualizado e um servidor de teste iniciado; nunca usa impressora física. As variáveis são `DESKTOP_TEST_URL`, `DATABASE_URL`, `DESKTOP_TEST_PASSWORD` e `PRINT_AGENT_TOKEN`.

`npm run smoke --workspace=@barbacue/desktop` cria uma API HTTP de teste em loopback e abre as telas locais no Electron com perfil temporário. Verifica os 24 módulos, login, criação/edição/disponibilidade de produto, status de pedido, multipart, conexão, sessão persistente, permissões, expiração e troca obrigatória de senha. O teste recusa solicitações de páginas online. Não usa produção nem valida hardware Windows. Capturas em `output/windows/*-api-windows.png`.

## API online necessária

Publique a versão web correspondente antes de distribuir o instalador 1.2.0. São adicionados `GET /api/admin/auth` (sessão atual, incluindo primeiro acesso e permissões) e `GET /api/admin/dashboard` (indicadores com a permissão `dashboard`). Os demais módulos usam os endpoints existentes. O site e o desktop compartilham `getDashboardData`, evitando fórmulas diferentes entre as interfaces. Não há migration nova para esta mudança.

O aplicativo reutiliza cookies válidos da versão anterior. Login/senha, permissões, desativação e troca obrigatória de senha são verificados pelo servidor. A senha e os cookies não são gravados em preferências ou localStorage do renderer. Sem a nova API de sessão, o aplicativo explica que o servidor precisa ser atualizado.

Gerar o `.exe` ou executar `stage:web` prepara arquivos locais; não publica a API nem o instalador em produção.

## Referências de implementação

- [Segurança Electron](https://www.electronjs.org/docs/latest/tutorial/security)
- [Impressão Electron](https://www.electronjs.org/docs/latest/api/web-contents)
- [Proteção de credenciais](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Build multiplataforma](https://www.electron.build/docs/features/multi-platform-build/)
- [Detalhes dos pedidos iFood](https://developer.ifood.com.br/en-US/docs/guides/modules/order/details)

## Download pela administração

`npm run stage:web --workspace=@barbacue/desktop` prepara o instalador existente e seu manifesto SHA-256 em `apps/web/private-downloads`. O comando de build Windows executa essa etapa automaticamente. A página `/admin/downloads` e a rota `/api/admin/downloads/windows` exigem perfil administrador; visitantes, clientes e outros perfis da equipe não recebem o arquivo. Consulte `apps/web/docs/DEPLOY.md` para transportar os artefatos privados ao servidor.

## Gestor local: quadros e lista (27/10/2026)

Caixa e pedidos permite alternar Quadros / Lista, buscar por número, cliente ou
telefone e filtrar por origem e etapa. Os quadros seguem Novos → Em preparo →
Prontos → Concluídos, com pedidos mais antigos primeiro. Cancelados aparecem em
Concluídos. Detalhes abrem à direita, com impressão, entregador e próxima ação no
rodapé. Escape fecha o detalhe e Tab mantém o foco dentro dele.

A saída para entrega continua sendo registrada pelo entregador. Pagamentos online
pendentes bloqueiam produção e impressão. A ação principal de pedidos iFood abre
o Gestor iFood, que usa comandos da integração; mudanças internas não os enviam.

Referência: https://blog-parceiros.ifood.com.br/painel-de-expedicao-gestor-de-pedidos/.
Primeira aproximação funcional: falta comparar com capturas da versão usada pela
loja para validar posição exata dos botões, menus, espaçamento e demais telas.
Não foi gerado nem publicado novo instalador.

Validação na raiz: `npm run build:renderer --workspace=@barbacue/desktop` e
`node apps/desktop/scripts/smoke-orders.mjs`. O teste usa API simulada e verifica
alternância, busca nas duas visões e aceite confirmado pelo servidor. Capturas em
`output/windows/gestor-pedido-detalhe.png`, `output/windows/gestor-pedidos-lista.png`
e `output/windows/pedidos-api-windows.png`.


## Quadros e lista na web e na marlondell — 27/10/2026

A página `/admin/orders` e o programa Windows compartilham o mesmo componente
sem uma variante exclusiva do desktop. Os estilos ficam em
`apps/web/src/app/admin/orders/order-manager.css`, importados por ambos os builds.
As duas visões, a busca, os filtros, o detalhe lateral e as ações são os mesmos.
A navegação externa à página segue a estrutura de cada plataforma.

O runtime web foi publicado sobre as fontes vigentes, preservando a atualização
concorrente de pareamento WhatsApp. Build publicado: `GPaiWD3KLZ4P3QREOs_TF`,
116 rotas. Sem migrations nem mudanças em ambientes, dados ou imagens Docker.
Evidências e scripts em `production/order-manager-20261027`.

O instalador 1.2.1 foi compilado na marlondell em
`C:\Users\Barbacue\Repos\barbacue-orders-20261027`, a partir de 316 arquivos
verificados por SHA-256, com 25 testes desktop e 27 testes de impressão aprovados.
O estado da instalação é registrado separadamente em `orders-installation.json`
nessa pasta; a existência do build não comprova a conclusão da instalação.

A instalação 1.2.1 foi concluída e conferida na marlondell. Pacote instalado
idêntico ao candidato, com servidor de produção configurado e impressão
automática desativada na primeira configuração. O relatório final e os limites
da validação Windows estão em `production/order-manager-20261027/README.md`.
O instalador disponível para download no servidor não foi substituído.
