# Gestão 1.1.0 — painel completo no celular

## Estado anterior

O Gestão 1.0.0 tinha dez funções operacionais Flutter, com consultas limitadas
em mesas, clientes, cupons e loja. ERP, iFood, WhatsApp, contas/permissões,
impressoras e configurações completas dependiam da web ou do Windows.
O checkout é compartilhado e já continha alterações de outras tarefas.

## Mudança

- Entrada **Painel de controle completo** na tela de acesso e no menu do Gestão.
- WebView privada Android/iOS com as páginas do painel publicado; formulários,
  edições, integrações, regras e autorização são os mesmos do site.
- Seletor nativo dos 24 módulos, com grupos e permissões da conta atual.
- Login independente da operação Flutter, HttpOnly no servidor, nenhuma senha,
  cookie nativo ou token Cog passado à WebView ou em URLs; limpeza de cookies
  na abertura/saída e armazenamento WebKit não persistente no iOS.
- Navegação HTTPS na origem configurada; SSO web do emissor próprio permitido
  separadamente. Links externos não recebem credenciais do painel.
- Downloads autenticados e exports `blob:` em blocos de até 64 KiB pela sessão da WebView;
  menu nativo para salvar/compartilhar; limite de 256 MiB por arquivo.
- Impressão do sistema e PDF, seletor de anexos, câmera/microfone opcionais.
  Permissões Android de câmera e áudio limitadas ao flavor Gestão; descrições
  iOS limitadas ao plist do Gestão.
- Atualização por GET; não reenvia formulários. Conteúdo encoberto ao app entrar
  em segundo plano. Sessão e permissões revistas ao navegar/retornar/selecionar
  função e a cada 30 segundos; o servidor autoriza cada ação.
- Preservadas as dez telas Flutter, a demonstração local e os três apps clientes.
- Build Gestão 1.1.0 (`2026102403`), acima do build anterior `2026102402`.
- Política de privacidade atualizada nos fontes para anexos, mídia opcional,
  sessões e arquivos. Precisa acompanhar a próxima publicação.

Dependências novas: flutter_inappwebview 6.1.5, share_plus 12.0.1,
permission_handler 12.0.1, path_provider 2.1.6; versões no pubspec.lock.
A primeira tentativa com permission_handler 13.0.2 falhou no script Gradle da
dependência; a versão 12.0.1 é compatível com a stack existente. Nenhum cache de
pacote foi editado para corrigir o build.

## Runtime de build

Entrega final padronizada em Flutter **3.41.9**, Dart **3.11.5**, engine
`9161402dc0e134b3fb5adee5046b6e84b1a5e1c1`.
A máquina também tinha Flutter 3.41.2; a mistura com o SDK do Gradle gerou
`Invalid SDK hash` no hook nativo de `objective_c`. Foi removido somente o
cache gerado `.dart_tool/hooks_runner`, e as verificações foram repetidas com
um único SDK. Não houve alteração global do Flutter ou dos ambientes privados.

## Reprodução da validação

Na pasta `apps/mobile`:

```sh
flutter analyze --no-pub
flutter test --no-pub
flutter test integration_test/management_panel_test.dart -d emulator-5554 \
  --flavor gestao --dart-define=MANAGEMENT_PANEL_QA=true
./scripts/build_brand.sh gestao android-apk
./scripts/build_brand.sh gestao ios-simulator
```

O teste de integração usa WebView real com servidor de dados fictícios no
loopback do aparelho. Percorre as 24 entradas e envia uma alteração fictícia
por página, verifica login/cookie HttpOnly, downloads HTTPS/HTTP local e blob,
bytes e nomes exportados, cancelamento de download, atualização das
permissões e limpeza dos cookies na saída. A ponte de exportação rejeita URLs
externas, arquivos locais e blobs não registrados.
O seletor de compartilhamento é interceptado no teste para conferir os arquivos
sem enviar dados a outro aplicativo. Esse teste verifica a integração móvel;
não revalida as regras dos 24 sistemas em contas reais.
O HTTP local exige o define QA e é rejeitado em binários release, mesmo se
compilados com esse define. Nenhuma validação de certificado TLS foi desativada.

## Resultados

- `flutter analyze --no-pub`: sem problemas.
- `flutter test --no-pub`: 148 testes aprovados; sete capturas opcionais ignoradas.
- Android API 35, WebView real: fluxo completo aprovado com as 24 funções,
  alterações fictícias, arquivos, permissões e saída; emulador de QA criado
  especificamente para esta tarefa, sem contas reais.
- iPhone 17 Pro Max/iOS 26.5, WKWebView real: fluxo completo aprovado com as
  mesmas 24 funções e controles de arquivos/sessão. Aplicativo de teste usa
  `com.lanchesdobarba.gestao.panelqa`, separado dos apps existentes.
- O teste de CSV reproduz a revogação imediata do blob usada pelo ERP. O app
  transfere esse export para o salvamento nativo antes da liberação do recurso.
- Corrigidas diferenças WebKit: números JavaScript recebidos como `double`,
  detecção de anexos `text/csv`, cancelamento e continuidade da página após
  download. O conteúdo binário é validado e convertido antes da escrita.

## Pacotes finais

Pasta: `output/mobile/gestao-panel-2026-10-27/`.

| Artefato | Arquivo | Uso |
| --- | --- | --- |
| APK Android | `Barbacue-Gestao-1.1.0-2026102403.apk` | Instalação/atualização Android |
| AAB Android | `Barbacue-Gestao-1.1.0-2026102403.aab` | Próximo envio ao Google Play |
| IPA assinado | `Barbacue-Gestao-1.1.0-2026102403.ipa` | Próximo envio à App Store/TestFlight |
| App de simulador | `Barbacue-Gestao-1.1.0-2026102403-Simulator.app.zip` | Simulador iOS; não instala em iPhone físico |

Os três pacotes de distribuição têm identificador `com.lanchesdobarba.gestao`,
versão 1.1.0 e build 2026102403. APK e AAB tiveram assinaturas verificadas.
O APK mantém o certificado do APK anterior, permitindo atualização sem
recriar a instalação. IPA: `codesign --verify --deep --strict` aprovado;
12 executáveis de dispositivo conferidos como **IOS**, e 13 de simulador
como **IOSSIMULATOR**. Nenhum `.env`, keystore ou chave privada de assinatura
foi encontrado nos pacotes APK/AAB/IPA. O IPA tem distribuição App Store,
sem upload; não é um pacote ad hoc para instalação direta em iPhone.

Hashes em `SHA256SUMS`; versões e validações em `manifest.json`;
fontes e runtime em `source-manifest.json`. Os 75 arquivos de fontes/ativos
foram conferidos antes e depois da compilação. O checkout modificado foi
registrado sem atribuir suas alterações a uma revisão Git limpa.
`build-results.json` registra os seis comandos finais com saída zero.
Logs e resultados dos testes foram preservados na mesma pasta. O emulador
Android criado para QA foi encerrado e removido; os demais dispositivos e
aplicativos foram preservados.

## Publicação e limites

Esta ampliação não substitui imagem/serviço, não executa migrações, não modifica
bancos, pedidos, contas, ambientes, chaves ou impressoras da operação.
Nenhuma atualização foi enviada à App Store/Google Play por esta tarefa.

Os recursos do painel dependem de internet e das integrações já configuradas
na loja. Testes com iFood/WhatsApp reais, permissões de hardware em aparelho
físico e impressão em papel continuam sendo verificações operacionais; não
foram executados com dados reais nesta tarefa. A impressão usa os destinos do
sistema/serviço existente, sem driver Windows ou novo protocolo Bluetooth.
Não é uma reimplementação integral do painel em widgets Flutter.
