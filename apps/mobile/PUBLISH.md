# Guia de publicação — Lanches do Barba

Este documento cobre tudo que precisa ser feito após o build inicial para publicar
o app nas lojas. O projeto já está compilado e os artefatos de release estão prontos.

---

## Artefatos gerados (não republicar sem nova versão)

| Arquivo | Localização | Uso |
|---|---|---|
| `app-release.apk` | `build/app/outputs/flutter-apk/` | Sideload / testes em dispositivo |
| `app-release.aab` | `build/app/outputs/bundle/release/` | Upload na Google Play |
| `Runner.xcarchive` | `build/ios/archive/` | Distribuição via Xcode Organizer |

---

## Credenciais importantes — GUARDE COM SEGURANÇA

```
Keystore Android : android/app/upload-keystore.jks
Alias            : upload
Senha            : barbacue2024
Team ID Apple    : Y5B2NQ244A
Bundle ID        : com.lanchesdobarba.barbacue
```

> O keystore é irreversível. Se perder, não consegue publicar atualizações
> na Play Store. Faça backup em local seguro (ex: 1Password, cofre criptografado).

---

## Parte 1 — Antes de publicar (obrigatório para ambas as plataformas)

### 1.1 Ícone do app ✅ FEITO

Ícone definitivo criado: porquinho com chapéu de chef abraçando um hambúrguer
flamejado, no amber da marca (gerado com a API de imagens da OpenAI a partir da
identidade BARBACUE). Fontes em `assets/icon/icon.png` (1024², fundo amber) e
`assets/icon/icon_foreground.png` (transparente, com safe-zone p/ adaptive).
Ícones de todas as plataformas já regenerados com `dart run flutter_launcher_icons`.

Para regenerar no futuro:

```yaml
# Adicionar em pubspec.yaml > dev_dependencies:
flutter_launcher_icons: ^0.14.3

# Adicionar ao final do pubspec.yaml:
flutter_icons:
  android: true
  ios: true
  image_path: "assets/icon/icon.png"   # PNG 1024x1024, fundo sólido
  adaptive_icon_background: "#F59E0B"  # amber do app
  adaptive_icon_foreground: "assets/icon/icon_foreground.png"
```

```yaml
# Adicionar em pubspec.yaml > dev_dependencies:
flutter_launcher_icons: ^0.14.3

# Adicionar ao final do pubspec.yaml:
flutter_icons:
  android: true
  ios: true
  image_path: "assets/icon/icon.png"   # PNG 1024x1024, fundo sólido
  adaptive_icon_background: "#F59E0B"  # amber do app
  adaptive_icon_foreground: "assets/icon/icon_foreground.png"
```

```bash
flutter pub get
dart run flutter_launcher_icons
```

### 1.2 Splash screen

```yaml
# dev_dependencies:
flutter_native_splash: ^2.4.5

# flutter_native_splash:
color: "#F59E0B"
image: assets/splash/logo.png
android: true
ios: true
```

```bash
dart run flutter_native_splash:create
```

### 1.3 URL de produção da API

O app aponta para `localhost` em desenvolvimento. Antes de publicar, defina a URL
real do servidor:

```bash
# Build com a URL de produção embutida
flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://barbacue.hirableaiagents.com

flutter build ipa --release \
  --dart-define=API_BASE_URL=https://barbacue.hirableaiagents.com \
  --export-options-plist=ios/ExportOptions.plist
```

---

## Parte 2 — Google Play (Android)

### 2.1 Criar conta de desenvolvedor

1. Acesse https://play.google.com/console
2. Pague a taxa única de **USD 25**
3. Complete o perfil da conta

### 2.2 Criar o app na Play Console

1. **All apps → Create app**
2. Preencha:
   - App name: `Lanches do Barba`
   - Default language: `Portuguese (Brazil)`
   - App or game: `App`
   - Free or paid: `Free`
3. Aceite as políticas e crie

### 2.3 Configurar o app

No menu lateral, complete todas as seções marcadas com `!`:

**Dashboard → Set up your app:**
- [ ] App access → All functionality is available without special access
- [ ] Ads → No ads
- [ ] Content rating → Preencher questionário (resultado esperado: Everyone)
- [ ] Target audience → 18+
- [ ] News apps → Not a news app
- [ ] COVID-19 → Not applicable

**Store presence → Main store listing:**
- [ ] App name: `Lanches do Barba`
- [ ] Short description (80 chars max): `Peça hambúrgueres artesanais do Barba direto pelo app`
- [ ] Full description (4000 chars max): descreva o cardápio e o processo
- [ ] Screenshots: mínimo 2 por tipo de dispositivo (phone obrigatório)
- [ ] Feature graphic: 1024×500 px (banner horizontal)
- [ ] App icon: 512×512 px PNG

### 2.4 Fazer o upload do AAB

1. **Release → Production → Create new release**
2. Em "App bundles", clique **Upload** e selecione:
   ```
   build/app/outputs/bundle/release/app-release.aab
   ```
3. Release name: `1.0.0`
4. Release notes (pt-BR):
   ```
   Versão inicial do app Lanches do Barba.
   Cardápio completo, carrinho e pedidos direto pelo celular.
   ```
5. Clique **Save** → **Review release** → **Start rollout to production**

### 2.5 Assinatura do app (Play App Signing)

A Play Console vai oferecer gerenciar a assinatura. Aceite — a Google re-assina
o AAB com chave própria para distribuição, mas o upload ainda usa o keystore local.

---

## Parte 3 — App Store (iOS)

### 3.1 Pré-requisitos

- Conta Apple Developer Program: **USD 99/ano** — https://developer.apple.com/enroll/
- Mac com Xcode instalado (já presente nesta máquina)
- O archive já está gerado em `build/ios/archive/Runner.xcarchive`

### 3.2 Registrar o Bundle ID

1. Acesse https://developer.apple.com/account → **Certificates, IDs & Profiles**
2. **Identifiers → +**
3. Selecione **App IDs → App**
4. Description: `Lanches do Barba`
5. Bundle ID (Explicit): `com.lanchesdobarba.barbacue`
6. Capabilities: nenhuma especial necessária
7. **Register**

### 3.3 Criar o app no App Store Connect

1. Acesse https://appstoreconnect.apple.com
2. **My Apps → +  → New App**
3. Plataformas: iOS
4. Name: `Lanches do Barba`
5. Primary language: Portuguese (Brazil)
6. Bundle ID: `com.lanchesdobarba.barbacue` (vai aparecer após o passo 3.2)
7. SKU: `barbacue-app` (identificador interno, não fica público)
8. **Create**

### 3.4 Exportar o IPA via Xcode

```bash
# Abre o Organizer no arquivo já gerado
open build/ios/archive/Runner.xcarchive
```

No Xcode Organizer:
1. Selecione o archive `Runner 1.0.0 (1)`
2. Clique **Distribute App**
3. Selecione **App Store Connect**
4. Selecione **Upload** (envia direto para a App Store Connect)
5. Assinatura: **Automatically manage signing**
6. Revise e clique **Upload**

> Se preferir exportar um IPA local primeiro, escolha **Export** no passo 4
> e use o `ExportOptions.plist` já configurado em `ios/ExportOptions.plist`.

### 3.5 Preencher os metadados na App Store Connect

Em **App Store → 1.0 Prepare for Submission:**

**App Information:**
- [ ] Category: Food & Drink
- [ ] Privacy Policy URL (obrigatório): crie uma página simples em `barbacue.hirableaiagents.com/privacy`

**Pricing and Availability:**
- [ ] Price: Free
- [ ] Availability: Brazil (ou All countries)

**App Store listing (pt-BR):**
- [ ] Screenshots: iPhone 6.9" obrigatório; iPad opcional
- [ ] App description: texto do cardápio
- [ ] Keywords (100 chars): `hamburguer,lanche,delivery,pedido,barba`
- [ ] Support URL: URL de suporte (pode ser o próprio site)

**Build:**
- [ ] Após o upload do passo 3.4, o build aparece aqui em ~5 min
- [ ] Selecione o build `1.0.0 (1)`

**Review Information:**
- [ ] Sign-in required: No
- [ ] Notes for reviewer: `App de pedidos para a lanchonete Lanches do Barba. Requer servidor backend em execução para funcionar.`

### 3.6 Submeter para revisão

1. Clique **Add for Review**
2. Clique **Submit to App Review**
3. Prazo de revisão da Apple: normalmente **24–48 horas**

---

## Parte 4 — Atualizações futuras

Para cada nova versão:

1. Incremente a versão em `pubspec.yaml`:
   ```yaml
   version: 1.0.1+2   # nome+build_number
   ```
2. Recompile:
   ```bash
   flutter build appbundle --release \
     --dart-define=API_BASE_URL=https://barbacue.hirableaiagents.com

   flutter build ipa --release \
     --dart-define=API_BASE_URL=https://barbacue.hirableaiagents.com \
     --export-options-plist=ios/ExportOptions.plist
   ```
3. Android: faça upload do novo AAB na Play Console → crie novo release
4. iOS: exporte via Xcode Organizer → submeta novo build na App Store Connect

---

## Referências rápidas

| Recurso | URL |
|---|---|
| Play Console | https://play.google.com/console |
| App Store Connect | https://appstoreconnect.apple.com |
| Apple Developer | https://developer.apple.com/account |
| Flutter deploy docs | https://docs.flutter.dev/deployment/android |
| Flutter iOS deploy | https://docs.flutter.dev/deployment/ios |
