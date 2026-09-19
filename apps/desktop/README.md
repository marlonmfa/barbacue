# Barbacue Pedidos — desktop Windows

Consulte [INSTALAR.md](./INSTALAR.md) para instalação e operação.

## Desenvolvimento e build

Na raiz do monorepo:

```sh
npm ci
npm run desktop
npm run test:desktop
npm run desktop:windows
```

Saída: `apps/desktop/release/Barbacue-Pedidos-1.0.0-Windows-x64-Setup.exe`.

A compilação copia o agente compartilhado para `vendor/print-agent` (não versionado). Electron e o agente são incluídos no instalador; o código web fica no servidor e não há dependência de Node.js na máquina final. O workflow `windows-desktop.yml` gera instalador e SHA-256 por execução manual ou tag `desktop-v*`. O pacote não contém senhas ou `.env`.

## Arquitetura

- `src/main.mjs`: processo principal; janela de configuração local, painel remoto isolado, bandeja, armazenamento protegido, coordenação serial da impressão e reinício.
- `src/settings.mjs`: validação de configuração e navegação. A chave não é retornada ao renderer. Trocar o servidor exige informar uma nova chave.
- `src/preload.cjs`: ponte restrita somente para a janela local; o painel remoto não recebe preload nem acesso ao sistema.
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

`npm run smoke --workspace=@barbacue/desktop` abre o Electron com perfil temporário, verifica a configuração, a ponte local e o isolamento do painel apontado para `http://127.0.0.1:3099`. Não é validação de hardware Windows.

## Referências de implementação

- [Segurança Electron](https://www.electronjs.org/docs/latest/tutorial/security)
- [Impressão Electron](https://www.electronjs.org/docs/latest/api/web-contents)
- [Proteção de credenciais](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Build multiplataforma](https://www.electron.build/docs/features/multi-platform-build/)
- [Detalhes dos pedidos iFood](https://developer.ifood.com.br/en-US/docs/guides/modules/order/details)

## Download pela administração

`npm run stage:web --workspace=@barbacue/desktop` prepara o instalador existente e seu manifesto SHA-256 em `apps/web/private-downloads`. O comando de build Windows executa essa etapa automaticamente. A página `/admin/downloads` e a rota `/api/admin/downloads/windows` exigem perfil administrador; visitantes, clientes e outros perfis da equipe não recebem o arquivo. Consulte `apps/web/docs/DEPLOY.md` para transportar os artefatos privados ao servidor.
