# Validação e distribuição — 24/10/2026

## Atualização de distribuição

A publicação da API e a assinatura iOS foram concluídas após a primeira
entrega local descrita abaixo. O estado mais recente de cada loja está em
`store-assets/RELEASE_STATUS.md`.

| Aplicativo | Versão de loja | Build Android/iOS | App Store |
| --- | --- | --- | --- |
| Barbacue Gestão | 1.0.0 | 2026102401 | WAITING_FOR_REVIEW |
| Barbacue | 1.2.5 | 2026102401 | WAITING_FOR_REVIEW |
| Chelas | 1.0.1 | 2026102401 | WAITING_FOR_REVIEW |
| Barbadog | 1.0.1 | 2026102401 | WAITING_FOR_REVIEW |

Os quatro AABs e quatro IPAs assinados estão em
`output/mobile/store-release-2026-10-24/`, com hashes SHA-256, identificadores
e versões no manifesto. Assinaturas verificadas com jarsigner e codesign.
Os quatro uploads foram aceitos pelo processamento da Apple como VALID.
Os quatro releases Android também foram enviados ao canal production do Google Play,
com distribuição no Brasil. A tela de cada app confirma Changes in review.
A liberação pública depende da revisão e das verificações automáticas das lojas.

Identidade das marcas aplicada aos clientes e logotipos da operação no Gestão.
Ícones adaptativos Android separados para Chelas e Barbadog. Gestão oferece
demonstração local identificada e link de privacidade para a equipe e revisores.

Validação atual: **138 testes aprovados**, 7 capturas opcionais ignoradas;
Flutter analyze sem problemas. API de permissões: 9 testes aprovados.
Capturas reais da demonstração: iPhone, iPad e Android, 3 execuções aprovadas.
A API foi publicada no host existente e passou por 50 verificações antes/depois,
com banco, contas, ambientes e arquivos operacionais preservados.
GET anônimo `/api/admin/auth`: **401 JSON**; política de privacidade: HTTP 200.
Detalhes em `GESTAO.md` e `apps/web/docs/PRODUCTION.md`.

Os números Android atuais permanecem abaixo do máximo de 2100000000.
As próximas versões devem incrementar o número atual de forma sequencial,
em vez de dar novos saltos de escala. O Play exibiu um aviso sobre o salto
em relação aos builds antigos; foi reconhecido para estes releases.

## Histórico: primeira compilação local

# Quatro aplicativos — validação local em 24/10/2026

## Estado anterior e mudança

O checkout já tinha três aplicativos Flutter de clientes: Barbacue, Chelas e
Barbadog, com identidades, cardápios e checkout nativo separados. Também havia
alterações web/Windows de outras tarefas no checkout compartilhado.

Foi acrescentado o quarto app, **Barbacue Gestão**, com identidade
`com.lanchesdobarba.gestao`, entrada própria, ícone próprio e telas nativas para
dez funções conforme as permissões da equipe. [Funções e limites](GESTAO.md).
Os três clientes foram preservados e recompilados. Os scripts agora geram os
quatro APKs, builds iOS de dispositivo sem assinatura e builds de simulador.

## Artefatos entregues

| Aplicativo | Android | iOS de dispositivo |
| --- | --- | --- |
| Barbacue Gestão | 1.0.0 (1) | 1.0.0 (1) |
| Barbacue | 1.2.4 (15) | 1.2.4 (14) |
| Chelas | 1.0.0 (4) | 1.0.0 (4) |
| Barbadog | 1.0.0 (4) | 1.0.0 (4) |

Os APKs de release instaláveis estão em `output/mobile/android/`, na raiz.
Os `.app.zip` de dispositivo estão em `output/mobile/ios-device/`.
Esses arquivos iOS estão **sem assinatura**, não são IPAs e ainda não permitem
instalação em iPhone/TestFlight. O Gestão precisa de registro e perfil Apple
próprios; as três marcas de clientes já tinham seu fluxo de distribuição.

Cada pasta contém `manifest.json`, `SHA256SUMS`, versão, identificador,
revisão Git e hashes dos fontes usados no checkout modificado. Os números das
versões existentes foram mantidos para esta compilação local; antes de um novo
envio às lojas, confira e incremente os números já usados.

## Testes e verificações

- `flutter analyze --no-pub`: nenhum problema.
- `flutter test --no-pub`: **136 testes aprovados**; 7 capturas opcionais
  permanecem ignoradas conforme `dart_test.yaml`.
- `python3 test/simulator_frameworks_test.py`: 3 testes aprovados.
- Compilação Android release dos quatro apps: concluída.
- `apksigner verify`: assinaturas dos quatro APKs válidas.
- Identificadores Android conferidos com `aapt dump badging`.
- Manifesto Android do Gestão: apenas entrada de launcher, sem capturar links
  de mesa dos clientes; ícone adaptativo próprio.
- Compilação release para dispositivo iOS dos quatro apps: concluída sem
  assinatura. `vtool` verificou os executáveis e frameworks para a plataforma
  **IOS**, evitando bibliotecas de simulador no pacote de dispositivo.
- Gestão instalado e aberto no simulador de iPhone 17 Pro; captura em
  `output/mobile/gestao-iphone.png`. Os 8 binários do pacote de simulador foram
  verificados como **IOSSIMULATOR**.
- Consulta pública com a biblioteca HTTP Dart usada pelos apps: **HTTP 200**
  nas três marcas; Barbacue, 26 categorias/195 produtos; Chelas, 9/66;
  Barbadog, 10/71. Evidência em `output/mobile/public-api-verification.json`.
- `git diff --check -- apps/mobile`: aprovado.

Os testes de gestão cobrem primeiro acesso, permissões, isolamento de cookies,
logout, expiração, respostas atrasadas, bloqueio de redirecionamentos, ausência
de repetição automática de alterações e ações da cozinha. Não foram criados
pedidos nem usados logins reais para testar produção.

## Pendências de uso e publicação

**API do Gestão:** a consulta pública a `GET /api/admin/auth` em produção
retornou **HTTP 405**. O app precisa da publicação da API de sessão,
`GET /api/admin/dashboard` e do fluxo individual de primeiro acesso que já
existiam como alterações locais antes desta tarefa. O app explica essa
dependência quando encontra a API antiga. A operação administrativa real só
pode ser verificada depois dessa publicação e de um login autorizado.

**iPhone:** assinatura e distribuição Apple continuam pendentes para os
artefatos desta entrega. Nenhum pacote foi enviado às lojas ou ao TestFlight.

**Produção:** nenhuma imagem ou backend foi publicado por esta tarefa; bancos,
contas, ambientes e serviços ativos foram preservados.

O disco ficou sem espaço durante as primeiras tentativas. Foram removidos
somente intermediários de compilação; os pacotes finais foram preservados.
O limite de memória e o paralelismo do Gradle foram reduzidos. Os builds finais
foram concluídos e validados após essas correções.
