# Barbacue Gestão para Android e iPhone

Quarto aplicativo da base Flutter, separado dos apps de clientes Barbacue,
Chelas e Barbadog. Identidade Android/iOS: `com.lanchesdobarba.gestao`.
Entrada: `lib/main_gestao.dart`. Ícone próprio de fachada vermelha.

## Painel completo no celular — versão 1.1.0

A entrada **Painel de controle completo** está disponível na tela de acesso e
no menu da operação. Os 24 módulos administrativos podem ser usados dentro do
aplicativo, conforme a conta: meu trabalho, indicadores, caixa/pedidos,
atendimento/WhatsApp, iFood, cozinha/impressoras, salão, entregas, teste de
pedidos, cardápios, cadastro de produtos, categorias, ofertas/cupons, ERP e
financeiro, mesas/QR, clientes, funcionários, usuários/permissões,
loja/horários, entrega/frete, beta, integrações, programa Windows e acessos.

O Gestão combina as telas Flutter de operação com o painel web responsivo em
WebView nativa. As funções completas usam as mesmas páginas, APIs, formulários,
validações e regras de negócio do painel publicado. Não são reimplementações
Flutter desses 24 módulos. A navegação nativa reúne as funções em quatro grupos,
consulta a sessão e respeita as restrições de administrador do servidor.

O painel tem login privado próprio. Entre nele com sua conta individual; esse
login não importa a senha, o cookie ou o token Cog da operação Flutter. Fechar
o painel encerra sua sessão local do painel e mantém a conta da operação nativa.
A opção de sair da conta dentro do site também continua disponível. No iOS,
a sessão web usa armazenamento não persistente; no Android, cookies são
apagados na abertura e no fechamento. Dados baixados são preparados na pasta
temporária do aplicativo; arquivos com mais de um dia são removidos na próxima
abertura. Arquivos que você salvar ou compartilhar fora do app permanecem no
destino escolhido.

Anexos usam o seletor do sistema. Câmera e microfone são opcionais, solicitados
quando necessários à ação e limitados à origem do painel. Downloads privados e
exports CSV/blob são lidos pela própria sessão web e encaminhados ao menu nativo
de salvar/compartilhar, com limite de 256 MiB por arquivo. A opção **Imprimir /
salvar PDF** usa a impressão do Android/iOS; botões de impressão das páginas
continuam usando esse serviço. Impressoras térmicas da loja continuam sendo
administradas pelo painel e pelo agente existente; isso não instala drivers
Windows no celular nem acrescenta suporte Bluetooth direto.

A opção de atualizar faz uma nova navegação GET, sem reenviar formulários.
Links externos abrem o navegador do sistema sem as credenciais do painel.
O SSO web do próprio site pode navegar no emissor `https://id.cog.ia.br`;
nenhuma inspeção de sessão, download ou permissão de mídia do app funciona
nessa origem. Internet e disponibilidade das integrações continuam necessárias.

Builds, validação e limites desta ampliação: [PAINEL-COMPLETO-2026-10-27.md](PAINEL-COMPLETO-2026-10-27.md).

## Operação nativa Flutter

Entre com a conta individual da equipe. O primeiro acesso exige trocar a senha
quando a conta estiver marcada pelo servidor. O app usa a API HTTPS existente
em `https://barbacue.cog.ia.br`, com sessão administrativa exclusiva em memória.
Reabrir o processo exige novo login. Senhas e cookies não são gravados em disco.

As funções aparecem conforme as permissões atuais da conta, verificadas em cada
atualização. O servidor também autoriza todas as consultas e alterações.

| Função nativa | Ações |
| --- | --- |
| Visão geral | Indicadores acumulados, marcas e últimos pedidos |
| Pedidos | Filtros de marca/etapa, itens, observações, pagamento; confirmar, preparar, concluir e cancelar com confirmação |
| Cozinha | Fila, itens, observações; iniciar preparo e marcar pronto |
| Salão | Mesas ativas e pedidos; marcar servido quando pronto |
| Minhas entregas | Somente entregas da conta; endereço, cobrança, saída e conclusão |
| Cardápios | Consultar, buscar, criar e editar produtos das três marcas; preço, categoria, descrição e disponibilidade |
| Mesas | Consulta de mesas ativas/inativas |
| Clientes | Consulta e busca de cadastro |
| Cupons | Consulta de códigos, descontos e ativação |
| Loja | Consulta de contato e horários; abrir/fechar recebimento de pedidos |

A fila atualiza a cada 30 segundos em primeiro plano e ao retornar ao app.
Também aceita atualização manual. Uma alteração que falha não é repetida
automaticamente. Pagamentos online e transições de preparo continuam sujeitos
às regras do servidor.

A tabela descreve os atalhos operacionais Flutter. Gestor iFood, financeiro/ERP,
WhatsApp, contas da equipe, impressoras e edição completa de cupons/mesas estão
na opção **Painel de controle completo**, dentro do próprio Gestão.

## Identidade visual

Paleta: vermelho da operação `#C51E2B`, texto `#24292E`, fundo `#F3F5F7`,
superfície `#FFFFFF`, divisórias `#E0E5E9`. Anton, já embarcada para a marca,
aparece nos títulos; a fonte do sistema mantém legibilidade nos pedidos.
Fila vertical com itens e observações visíveis, confirmação antes de alterar
etapas e filtros de marca no topo. Navegação por funções no menu lateral.
O foco visual são os pedidos e as ações de preparo; não há dados de exemplo
misturados à operação.

## Build reproduzível

Execute na pasta `apps/mobile`, com Flutter 3.41.9/Dart 3.11.5 e os SDKs nativos.
Use o mesmo SDK na CLI e no Gradle/Xcode; esta versão foi validada com esse
runtime, mantendo as dependências do `pubspec.lock`.
As dependências existentes estão fixadas em `pubspec.lock`; não foi acrescentado
pacote para o Gestão.

```sh
flutter pub get --enforce-lockfile
flutter analyze
flutter test
./scripts/build_brand.sh gestao android-apk
./scripts/build_brand.sh gestao android
./scripts/build_brand.sh gestao ios-simulator
./scripts/build_brand.sh gestao ios-device
```

`android-apk` gera um APK de release instalável; `android` gera o AAB para loja.
Requer as credenciais Android locais já configuradas; elas não são versionadas.
`ios-simulator` gera `.app` de simulador; `ios-device` compila um `.app` de
dispositivo sem assinatura. Nenhum deles é um IPA distribuível por TestFlight.

O Gestão está registrado na Apple e usa o perfil manual `Gestao AppStore`
e a identidade Apple Distribution da equipe `3A3X2G4UPK`.
`./scripts/build_brand.sh gestao ios` gera archive e IPA assinados para App Store/TestFlight.
Os perfis e a chave privada permanecem fora do repositório.
O Gestão não assume os links de mesa dos apps de clientes.

Para compilar os quatro apps, use `./scripts/build_all_brands.sh android-apk`,
`android`, `ios-simulator` ou `ios-device`. Os builds são sequenciais porque o
projeto iOS compartilha arquivos gerados pelo Flutter. Não execute dois builds
Flutter nesta pasta simultaneamente.

## Validação

Os testes `management_api_test.dart` e `management_app_test.dart` cobrem cookies
isolados, logout, respostas atrasadas, permissões explícitas e padrão, bloqueio
de redirecionamentos, primeiro acesso, expiração, ações de cozinha e layout de
telefone. Os demais testes validam os três clientes, incluindo checkout nativo.
Testes usam HTTP simulado e não criam pedidos nem alteram cadastros de produção.

Builds e testes locais não publicam os apps nas lojas nem alteram o backend.

Em 24/10/2026, a API de sessão e o resumo foram publicados no host de produção existente.
A consulta anônima a `GET /api/admin/auth` retorna **401 JSON**, conforme esperado.
A implantação passou por 50 verificações de sessão, permissões, primeiro acesso,
catálogos e páginas públicas, com backup de aplicação e banco. Nenhum pedido
foi criado para validação. Consulte `apps/web/docs/PRODUCTION.md`.

A tela inicial oferece **Ver demonstração**, com dados fictícios locais e faixa
explícita. Essa opção não transmite alterações nem acessa contas reais. Login
e navegação incluem a política pública de privacidade. Os testes da demonstração
verificam que as alterações ficam locais e que o logout restaura a API real.

Os quatro IPAs assinados do build `2026102401` foram aceitos pelo processamento
da Apple e enviados à revisão. Os quatro AABs também foram enviados à revisão de produção do Google Play,
com lançamento no Brasil. A aprovação e a liberação pública dependem das lojas.
Pacotes assinados e hashes: `output/mobile/store-release-2026-10-24/manifest.json`.

Para organizar os quatro APKs e validar seus identificadores:

```sh
python3 scripts/stage_four_apps.py android
python3 scripts/stage_four_apps.py ios-simulator
python3 scripts/stage_four_apps.py ios-device
```

Cada comando exige os quatro builds da plataforma e prepara arquivos,
`manifest.json` e `SHA256SUMS` em `output/mobile/<plataforma>` na raiz do
repositório. O manifesto distingue APK, simulador e build de dispositivo sem
assinatura; nenhum comando publica os artefatos.
