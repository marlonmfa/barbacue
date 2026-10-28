# Validação — Barbacue Pedidos 1.2.0: telas locais e API online

Data: 24/10/2026. Desenvolvimento, Electron real e empacotamento executados em macOS Apple Silicon.

## Estado anterior e mudança

A versão 1.1.0 carregava as páginas administrativas online dentro do aplicativo. A 1.2.0 compila e inclui no instalador as telas React, CSS e imagens de identidade. O processo principal acessa diretamente a API online usando uma partição de sessão persistente. Não há WebContentsView remoto, servidor HTTP ou banco local. Produtos, pedidos, atendimento/WhatsApp, cozinha, ERP e os demais módulos continuam usando as regras e os dados do backend online.

A mudança acrescenta `GET /api/admin/auth` (sessão atual e permissões) e `GET /api/admin/dashboard` (indicadores). O site e a API compartilham a mesma função de cálculo do painel. Não há migration nova. A impressão e o perfil do usuário da instalação anterior são preservados.

## Verificações desta versão

- **47 testes desktop/agente aprovados**: 20 do desktop (incluindo transporte online) e 27 do agente de impressão.
- **9 testes de permissões aprovados**, incluindo o novo endpoint de indicadores e a mesma restrição aplicada à página do painel.
- **Build Next.js de produção aprovado**, com TypeScript, incluindo os novos endpoints.
- **Smoke em Electron real aprovado** com API de teste em loopback e perfil descartável: 99 chamadas de API, nenhum HTML/JavaScript online carregado. As telas dos 24 módulos foram renderizadas localmente.
- O smoke criou e editou um produto, alterou sua disponibilidade, atualizou o status de um pedido e enviou um arquivo multipart à API de teste. Verificou sessão HttpOnly fora do renderer, expiração, revogação de permissões, primeiro acesso/troca de senha, falha de conexão, recuperação e sessão após reiniciar.
- Downloads foram salvos pela sessão autenticada e seus bytes conferidos. O QR renderizado da mesa foi comparado com a matriz esperada para a URL **online**; o lançamento de pedido da mesa abriu a tela local e consultou os endpoints online de cardápio, funcionamento e resolução da mesa.
- O transporte rejeita HTML/redirecionamentos de API, limita o tamanho dos corpos enviados, não encaminha cabeçalhos de credenciais do renderer e não repete uma gravação após falha de conexão incerta.
- **Instalador NSIS Windows x64 1.2.0 gerado**, aproximadamente 107 MB. Fontes, bundle React/CSS e agente conferidos dentro de `app.asar`. Nenhum `.env`, configuração pessoal, journal ou pacote de banco incluído.
- SHA-256 em `release/SHA256SUMS.txt`. Instalador e manifesto preparados em `apps/web/private-downloads` para publicação pelo procedimento existente.
- Capturas revisadas: `output/windows/produtos-api-windows.png`, `pedidos-api-windows.png`, `atendimento-api-windows.png` e `reconexao-api-windows.png`. Todas usam dados fictícios da API de teste.

## Publicação e limites

**Não publicado em produção.** O instalador final está em `apps/desktop/release/Barbacue-Pedidos-1.2.0-Windows-x64-Setup.exe`. Os endpoints novos precisam ser publicados no servidor antes de usar esta versão; o aplicativo mostra uma orientação se a API de sessão ainda não existir. A cópia privada local não significa que o download novo já está disponível no site.

Nenhuma conta, pedido real, banco, arquivo de ambiente, volume ou configuração ativa de produção foi alterada. Não foram acessadas contas reais de WhatsApp/iFood nem impressoras físicas. A instalação e o driver ainda precisam ser validados em Windows real; o pacote permanece sem assinatura digital de editor. Os testes do desktop usam uma API fictícia e não substituem a validação das integrações e regras de negócio no ambiente publicado. Requer internet; não mantém um banco local nem uma fila automática de alterações offline.

---

# Histórico — versão 1.1.0

Data: 24/10/2026. Desenvolvimento, Electron real e empacotamento em macOS Apple Silicon.

## Estado anterior e mudança

O aplicativo existente priorizava pedidos, iFood e impressão, abrindo diretamente a área de pedidos. A versão 1.1.0 adiciona uma janela administrativa com barra local e conteúdo remoto isolado, seleção de 24 funções, menus nativos, atalhos de teclado, histórico de navegação, recuperação de conexão e relatórios autenticados em janelas separadas. A área inicial é Meu trabalho, acessível aos diferentes perfis. Produtos, atendimento e demais operações usam as mesmas telas e o mesmo backend do site. A gestão funciona sem chave de impressão; os recursos de impressão existentes foram preservados.

## Verificações desta versão

- `npm run test:desktop`: **42 testes aprovados** (15 do desktop e 27 do agente). Inclui cobertura de todos os links administrativos, existência das páginas, validação da navegação, isolamento das chaves, política de microfone e regressões da impressão.
- `npm run smoke --workspace=@barbacue/desktop`: **aprovado**, com Electron real, perfil temporário e servidor HTTP de teste em loopback. Exercita login da fixture, navegação pelas 24 funções, voltar/avançar, seleção de arquivo, relatório em outra janela com sessão, comandos inválidos, bloqueio de navegação externa/local, falha de conexão, recuperação e persistência da configuração/sessão após reiniciar.
- `npm run desktop:windows`: **aprovado**, instalador NSIS em português para Windows x64, versão **1.1.0**, aproximadamente **106 MB**.
- Inspeção de `app.asar`: fontes e metadados de execução conferidos com o projeto, incluindo o agente de impressão. Nenhum `.env`, configuração pessoal ou journal incluído no pacote.
- SHA-256 gerado em `release/SHA256SUMS.txt`; instalador e manifesto preparados em `apps/web/private-downloads` para o processo de publicação existente.
- Capturas revisadas em `output/windows/configuracao-windows.png`, `administracao-windows.png` e `reconexao-windows.png`. As telas do painel nessas capturas são da fixture de teste.

## Publicação e limites

**Não publicado no servidor.** Nenhum banco, conta, pedido real, ambiente, volume ou configuração de produção foi alterado. O `.exe` foi gerado localmente e está disponível em `apps/desktop/release/Barbacue-Pedidos-1.1.0-Windows-x64-Setup.exe`. A cópia privada local não comprova disponibilidade do novo download no site em produção.

O instalador ainda precisa ser executado em um Windows real; instalação, inicialização com o Windows e impressão física dependem dessa conferência. O pacote continua sem assinatura digital. Não houve teste de uma conta real de WhatsApp/iFood nem nova validação das regras de negócio do backend: o smoke usa uma fixture local. O aplicativo exige internet e os módulos/integrações correspondentes publicados no site. Não há edição offline. A política de microfone foi testada sem acionar hardware.

---

# Histórico — validação da versão 1.0.0

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
