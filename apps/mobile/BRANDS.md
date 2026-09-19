# Aplicativos Barbacue, Chelas e Barbadog

O projeto Flutter gera três aplicativos independentes a partir da mesma base.
Eles podem coexistir no mesmo aparelho e são publicados separadamente.

| App | Android/iOS bundle ID | Backend | Fluxo de pedido |
| --- | --- | --- | --- |
| Barbacue | `com.lanchesdobarba.barbacue` | `barbacue.cog.ia.br` | Carrinho, cupom, checkout, Pix, mesa e chat nativos |
| Chelas | `com.lanchesdobarba.chelas` | `chelas.hirableaiagents.com` | Cardápio nativo e abertura do prato/restaurante no iFood |
| Barbadog | `com.lanchesdobarba.barbadog` | `barbadog.hirableaiagents.com` | Cardápio nativo e abertura do prato/restaurante no iFood |

Chelas e Barbadog levam um snapshot versionado do scraping dentro do app. Assim,
o cardápio aparece instantaneamente mesmo com conexão fraca; preço,
disponibilidade e checkout são confirmados no iFood ao abrir o item.

## Executar

No Android, use `flutter run --flavor <marca> -t lib/main_<marca>.dart
--dart-define=RELEASE_BRAND_ENDPOINT=true`. No iOS, use o script de simulador
abaixo, que também aplica o bundle ID, o nome e o ícone específicos.

## Android

```bash
./scripts/build_brand.sh chelas android
./scripts/build_all_brands.sh android
```

Os `.aab` ficam em `build/app/outputs/bundle/<marca>Release/`.

## iOS

Validação sem assinatura:

```bash
./scripts/build_brand.sh chelas ios-simulator
```

Archive para App Store Connect:

```bash
./scripts/build_brand.sh chelas ios
```

Os três bundle IDs e os perfis de distribuição já estão registrados no time
`3A3X2G4UPK`. O script usa assinatura manual com o perfil AppStore AssocDomains
de cada marca e aplica nome, bundle ID, domínio e ícone ao archive. A preparação
iOS recompila os artefatos de dispositivo para evitar incluir bibliotecas do
simulador no IPA. Os IPAs ficam em `build/ios/ipa/<marca>/barbacue.ipa`.

## Privacidade e estado da publicação

Cada aplicativo oferece a central **Privacidade e ajuda**, com política de
privacidade, termos, consentimento, exclusão de dados e suporte. No Barbacue,
o chat exige consentimento específico antes de enviar dados à OpenAI; revogar
o consentimento apaga o histórico local da sessão e exige nova autorização.

As páginas são geradas por `scripts/generate_legal_pages.py` em
`../web/public/legal/<marca>/`. O estado confirmado nas lojas, os testes e os
links públicos estão em [RELEASE_STATUS.md](store-assets/RELEASE_STATUS.md).

## Sincronizar cardápios embarcados

Depois de um novo scraping do site, atualize os snapshots:

```bash
cp ../web/src/data/chelas.json assets/brands/chelas-menu.json
cp ../web/src/data/barbadog.json assets/brands/barbadog-menu.json
```
