# Validação — Barbacue Pedidos 1.0.0

Data: 10/09/2026. Desenvolvimento e empacotamento executados em macOS Apple Silicon. Nenhum pedido real foi criado, nenhuma impressora física foi acionada e nenhum servidor de produção foi atualizado.

## Aprovado

- 8 testes do aplicativo: origem HTTPS/loopback, configuração, não exposição da chave, restrição de navegação, HTML escapado, sucesso/erro/timeout e impressora ausente.
- 25 testes do agente compartilhado: formatação 32/48 colunas, tickets v1/v2, seis origens, reservas, confirmação perdida, journal, reinício, exclusão mútua, TCP e CUPS simulados.
- 4 testes do mapeamento iFood: valores, adicionais, pagamentos mistos, identificador estável, validação de quantidade e dry-run sem gravação.
- 2 testes de importação: validação de valores e identidade por origem, pedido externo e marca.
- Integração em PostgreSQL isolado `barbacue_desktop_test_20260910`: autenticação, consulta da capacidade de impressão, importação simultânea de cinco fontes, uma única tarefa por pedido, cancelamento antes do envio, fluxo do agente e ausência de nova impressão após mudança de status.
- Integração real do conector iFood com o banco de teste e dados fictícios: recebimento, confirmação, cancelamento, rejeição de regressão de status e ausência de duplicação de tarefa.
- Electron real, perfil temporário: abertura, configuração, salvamento pela ponte local, login no painel e ausência de Node.js/ponte nativa/chave de impressão no conteúdo remoto.
- Navegador Chromium: login, listagem, filtro por origem, detalhe, chamada da impressão manual, alteração de status e interface de importação. Nenhum erro de JavaScript no fluxo testado.
- Build Next.js de produção e checagem TypeScript do iFood aprovados. Verificação de lint das telas/rotas novas e do painel alterado aprovada.
- Instalador NSIS Windows x64 gerado, com ícone e atalhos. Conteúdo do pacote conferido contra os arquivos finais; arquivos de configuração e `.env` não fazem parte do instalador.

## Limites da validação

- O instalador não foi executado em uma máquina Windows real. Falta conferir instalação/desinstalação, inicialização no login e driver da impressora no computador da loja.
- Impressão física em 58 mm, 80 mm ou A4 depende do driver e do teste de papel na loja. Confirmação de spool não comprova papel impresso.
- O pacote não tem assinatura digital de editor.
- O servidor de produção ainda precisa receber o código e a migration `0013_all_channel_printing`. O aplicativo verifica essa capacidade antes de consumir a fila.
- O conector iFood não foi validado contra uma conta real; depende de credenciais e habilitações válidas. Comandos locais do painel não são enviados ao iFood.
- Não existe operação de pedidos offline: pedidos recebidos pelo servidor são preservados na fila, e a operação retoma após reconexão.

Capturas em `output/windows/configuracao-windows.png` e `output/windows/pedidos-navegador.png`.
