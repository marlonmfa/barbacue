# Gestão 1.1.0 — envio às lojas em 27/10/2026

O Gestão ganhou o painel completo com 24 módulos dentro do app e manteve as
dez telas operacionais Flutter. Versão `1.1.0`, build `2026102403`.

- Apple: build VALID, descrição, subtítulo e notas de revisão atualizados;
  reenvio da submissão `09d0fad1-3e90-4585-acb0-5d72a6f7752e` confirmado como
  **WAITING_FOR_REVIEW**, com liberação automática após aprovação.
- Google Play: AAB recebido no canal production, rollout de 100% no Brasil;
  descrição curta/completa, novidades e Segurança dos dados atualizadas.
  **CHANGES_IN_REVIEW** confirmado após retomar o envio. Verificações rápidas
  ainda em andamento; encaminhamento automático após conclusão bem-sucedida.
  Publicação gerenciada desligada, liberação após aprovação.
- Política de privacidade publicada no host de produção existente, HTTP 200,
  sem reiniciar serviço ou alterar banco, contas, volumes ou ambiente.

As notas da Apple respondem às nove perguntas da rejeição 4.3/4.2.6 e registram
que Marlon é sócio do Barbacue, desenvolvendo para sua empresa com anuência do
outro sócio. Não se alega beta externo nem aplicativo inteiramente nativo.
A demonstração local cobre a operação; o painel privado exige conta autorizada.

Evidências: `output/mobile/store-submit-2026-10-27/`.
Artefatos e validação: [PAINEL-COMPLETO-2026-10-27.md](../PAINEL-COMPLETO-2026-10-27.md).
Envio à revisão não significa aprovação ou disponibilidade pública.

---

# Distribuição dos quatro apps — 24/10/2026

Verificação concluída em 2026-10-25T02:34:52.883991+00:00.

| Aplicativo | Versão | App Store | Google Play |
| --- | --- | --- | --- |
| Barbacue Gestão | 1.0.0 | [WAITING_FOR_REVIEW](https://appstoreconnect.apple.com/apps/6826725851/distribution/reviewsubmissions) | [CHANGES_IN_REVIEW](https://play.google.com/console/u/0/developers/5229217853410599529/app/4972986029734444042/publishing) |
| Barbacue | 1.2.5 | [WAITING_FOR_REVIEW](https://appstoreconnect.apple.com/apps/6782376058/distribution/reviewsubmissions) | [CHANGES_IN_REVIEW](https://play.google.com/console/u/0/developers/5229217853410599529/app/4974372920074838543/publishing) |
| Chelas | 1.0.1 | [WAITING_FOR_REVIEW](https://appstoreconnect.apple.com/apps/6807118144/distribution/reviewsubmissions) | [CHANGES_IN_REVIEW](https://play.google.com/console/u/0/developers/5229217853410599529/app/4973223313204667125/publishing) |
| Barbadog | 1.0.1 | [WAITING_FOR_REVIEW](https://appstoreconnect.apple.com/apps/6807118285/distribution/reviewsubmissions) | [CHANGES_IN_REVIEW](https://play.google.com/console/u/0/developers/5229217853410599529/app/4975194471537268191/publishing) |

Os oito envios foram confirmados. Na Apple os quatro builds `2026102401`
processaram como VALID e as versões estão WAITING_FOR_REVIEW.
Liberação automática AFTER_APPROVAL. No Google Play as quatro versões foram
enviadas ao canal **production**, com rollout completo no Brasil e publicação
gerenciada desligada. A tela confirma Changes in review; as verificações
automáticas iniciais do Google ainda podem estar em andamento.
**Envio à revisão não significa aprovação nem disponibilidade pública.**

API do Gestão publicada no host atual: build `ZnqXTYJAItJLMco5e6go6`.
Backup de aplicação e banco preservado; 50 verificações antes/depois aprovadas.
Acesso anônimo à sessão: HTTP 401 JSON; política pública: HTTP 200.

Gestão: novo registro Apple `6826725851`, pacote `com.lanchesdobarba.gestao`,
perfil manual `Gestao AppStore`, equipe `3A3X2G4UPK`. Registros e perfis dos
três clientes preservados. Revisores acessam a demonstração local identificada,
sem senhas de produção nem operações reais.

Ícones e identidade visual por marca nos apps. Declarações de privacidade,
classificação, acesso, publicidade e conteúdo concluídas para o Gestão.
Contato de suporte e política publicados em `/legal/gestao/`.

Validação: 138 testes Flutter aprovados (7 capturas opcionais ignoradas),
análise estática sem problemas; 9 testes de permissões da API; capturas
reais da demonstração em iPhone, iPad e Android com 3 execuções aprovadas.
Assinaturas dos quatro IPAs e AABs e identificadores iOS verificados.

Pacotes: `output/mobile/store-release-2026-10-24/`. A pasta contém os oito
artefatos finais, `manifest.json`, `SHA256SUMS`, `source-manifest.json`,
estados das duas lojas e relatório da implantação. Nenhuma chave privada
foi incluída. Evidências visuais em `output/mobile/*-review.png`.
Os APKs e `.app.zip` da primeira entrega local são históricos; use os
AABs/IPAs desta pasta para identificar os envios atuais.

O Play exibiu aviso pelo salto no versionCode. O código atual é válido e
foi reconhecido para estes releases. Nas próximas atualizações, incrementar
sequencialmente a partir de `2026102401`, sem novos saltos de escala.

---

## Histórico anterior

# Atualização de 21 de setembro de 2026

Chelas e Barbadog: rejeição 4.2 tratada com checkout nativo. Build iOS 1.0.0 (4) enviado, VALID e anexado à versão 1.0. Descrições, notas, páginas públicas e declarações de privacidade atualizadas. Nova revisão ainda não submetida; aprovação pendente da Apple. [Entrega e validação](NATIVE_CHECKOUT_2026-09-21.md).

---

# Estado dos releases — atualização de 9 de setembro de 2026

Estado observado nas lojas nesta data; a aprovação final depende de cada loja.

| Aplicativo | iOS | Android |
| --- | --- | --- |
| Barbacue | 1.2.4 (14), READY_FOR_SALE — aprovado e publicado na App Store | 1.2.4 (15), aprovado e disponível aos testadores selecionados na faixa Alpha desde 08/09 às 19:24 |
| Chelas | 1.0 (3), WAITING_FOR_REVIEW; publicação automática após aprovação | 1.0.0 (3), enviado para revisão do teste fechado Alpha; classificação Livre no Brasil; painel confirma Changes in review, com checks automáticos em andamento |
| Barbadog | 1.0 (3), WAITING_FOR_REVIEW; publicação automática após aprovação | 1.0.0 (3), enviado para revisão do teste fechado Alpha; classificação Livre no Brasil; painel confirma Changes in review, com checks automáticos em andamento |

Em 09/09/2026 a API Apple confirmou Barbacue 1.2.4 como READY_FOR_SALE. Chelas 1.0 (3) e Barbadog 1.0 (3) continuam WAITING_FOR_REVIEW, com AFTER_APPROVAL.
O comprovante da consulta Apple está em [apple-status.json](qa-2026-09-08/apple-status.json).
Em 09/09 o Google Play confirmou **Available to selected testers** para Barbacue 1.2.4 (15). Chelas e Barbadog estão com classificação **Livre** no Brasil e todas as declarações concluídas. As 14 alterações de cada aplicativo foram enviadas; os dois painéis confirmaram **Changes in review**. As verificações automáticas ainda estão em andamento e seguem automaticamente à revisão se concluídas sem impedimentos.
Os metadados preparados estão em [store-metadata-2026-09-08.json](store-metadata-2026-09-08.json).

## Testes realizados

- `flutter analyze --no-pub`: sem problemas.
- `flutter test --no-pub --run-skipped`: **130 testes passaram**, incluindo comparações visuais, checkout, pagamentos, roteamento das marcas e consentimento.
- Consentimento de IA: recusa não envia requisições; aceite permite envio; revogação exige nova autorização; consentimentos de versão antiga são invalidados.
- Três aplicativos compilados, instalados e abertos no simulador iOS e no emulador Android dedicado (API 35). Os cardápios das três marcas foram inspecionados visualmente.
- Os AABs finais foram validados com bundletool. Todos usam target SDK 36 e incluem a permissão INTERNET no pacote de publicação.
- O teste Android encontrou falta da permissão INTERNET no manifesto principal. Ela foi adicionada e o Barbacue build 15 carregou o cardápio de produção após nova instalação. Builds Android 13 e 14 não devem ser publicados.
- O arquivo de falhas do emulador dedicado ficou vazio após as inicializações finais.
- As 15 páginas públicas responderam HTTP 200; títulos e links internos foram verificados.
- Não foram feitos pagamentos nem pedidos reais. Testes em aparelhos físicos e o período exigido de teste fechado do Google continuam externos a esta validação.

Capturas: [iOS e Android](qa-2026-09-08/).

## Páginas publicadas

Cada central tem links para política de privacidade, termos, consentimento,
solicitação de exclusão de dados e suporte:

- [Barbacue](https://barbacue.cog.ia.br/legal/barbacue/support.html)
- [Chelas](https://chelas.hirableaiagents.com/legal/chelas/support.html)
- [Barbadog](https://barbadog.hirableaiagents.com/legal/barbadog/support.html)

Os documentos também estão acessíveis dentro dos aplicativos em **Privacidade e ajuda**.
Os aplicativos não exigem criação de conta. Solicitações sobre dados de pedidos
são encaminhadas pelo canal indicado; o app não promete apagar dados do servidor automaticamente.
O Barbacue pede consentimento explícito e revogável para o chat com OpenAI.

## Pacotes e reprodução

Na pasta `apps/mobile`:

```sh
./scripts/build_brand.sh barbacue android
./scripts/build_brand.sh chelas android
./scripts/build_brand.sh barbadog android
./scripts/build_brand.sh barbacue ios
./scripts/build_brand.sh chelas ios
./scripts/build_brand.sh barbadog ios
```

- Android: `build/app/outputs/bundle/<marca>Release/app-<marca>-release.aab`.
- iOS: `build/ios/ipa/<marca>/barbacue.ipa` (o nome de arquivo é compartilhado, mas cada pacote tem o bundle ID da própria marca).
- APKs em `build/qa-apks/` são derivados dos AABs e assinados para teste local; não são os artefatos enviados às lojas.
- O script iOS recompila artefatos de dispositivo antes de arquivar, evitando incluir bibliotecas de simulador no IPA.
- As versões por plataforma são definidas em `scripts/build_brand.sh`; aumentar o número antes de um futuro envio.

## Pendências externas

1. Aguardar revisão Apple de Chelas e Barbadog. Ambos estão configurados para publicação automática após aprovação. Barbacue já está publicado.
2. Produção Android do Barbacue: o Play Console informou **1 participante inscrito** e exige **12 participantes por 14 dias contínuos** antes de solicitar acesso à produção. Não foi feita inscrição fictícia nem contornado esse requisito.
3. Aguardar verificações automáticas e revisão Google de Chelas e Barbadog. Ambos foram enviados ao teste fechado Alpha com classificação Livre. Nenhum aceite ou formulário permanece pendente nesta submissão.

## Preparação Google Play em 09/09

- Chelas: app ID `4973223313204667125`; Barbadog: `4975194471537268191`.
- Idioma pt-BR, aplicativos gratuitos, categoria Food & Drink; e-mail e sites de suporte preenchidos.
- Privacidade, acesso sem login, ausência de anúncios e de identificador publicitário, público adulto, segurança de dados, governo, finanças e saúde salvos.
- Segurança de dados: identificadores técnicos de conexão (incluindo IP nas requisições das imagens ao CDN do iFood), coletados/compartilhados para funcionamento e segurança, conexão criptografada e link para solicitar exclusão. Não declaramos retenção apenas em memória sem evidência. Sem SDK de publicidade, análise ou cadastro no app.
- Ícones 512×512, banners 1024×500, duas capturas 432×768 por marca e descrições pt-BR enviados e validados pela página da loja. Materiais em `play-chelas/` e `play-barbadog/`.
- Capturas produzidas com componentes reais Flutter; quatro capturas passaram pelo processo de renderização, sem alterar o aplicativo para publicação. Reprodução: `flutter test --no-pub --update-goldens tools/store-capture/privacy_capture_test.dart`.
- Faixas Alpha configuradas para Brasil e lista existente `HirableAITesters` (14 endereços), com o mesmo canal de feedback do Barbacue. Número de endereços não equivale a participantes inscritos.


## Referências das lojas

- [Revisão da Apple](https://developer.apple.com/app-store/review/guidelines/)
- [Dados de usuários no Google Play](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Exclusão de dados no Google Play](https://support.google.com/googleplay/android-developer/answer/13327111)

Em ambos os apps, o painel confirmou **Ready to release** para o build 3 (Android 24+, target 36). Após confirmar **Send changes for review**, ambos passaram a **Changes in review**, com checks automáticos em andamento. Evidência estruturada: [google-play-status.json](qa-2026-09-09/google-play-status.json).

## Convites públicos

Links e pendências de acesso detalhados em [PUBLIC_INVITES.md](PUBLIC_INVITES.md). Os links TestFlight foram habilitados; a revisão beta externa foi bloqueada pelo erro Apple “Beta Contract is missing”. O convite Android por grupo público aguarda CAPTCHA e posterior configuração da faixa, preservando os testadores atuais.

## Diagnóstico do bloqueio TestFlight

Nova tentativa de revisão dos três apps reproduziu HTTP 422 `ENTITY_UNPROCESSABLE.BETA_CONTRACT_MISSING`, apesar dos builds `VALID`. Evidência: [beta-contract-diagnostics.json](beta-contract-diagnostics.json). Solicitação ao suporte preparada em [APPLE_BETA_CONTRACT_SUPPORT.md](APPLE_BETA_CONTRACT_SUPPORT.md), ainda não enviada. Sessão Apple do navegador expirada; confirmação atual de contratos na conta depende de novo login.
