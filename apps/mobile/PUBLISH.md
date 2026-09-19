# Publicação — BARBACUE — Burguers na Brasa

> Atualização de 08/09/2026: os releases atuais das três marcas usam
> `scripts/build_brand.sh <marca> <android|ios>`. Consulte
> [BRANDS.md](BRANDS.md) e [estado confirmado nas lojas](store-assets/RELEASE_STATUS.md).
> As instruções históricas abaixo não substituem as versões e os perfis do script.

Runbook de release do app (iOS + Android). O app é um cliente Flutter da API em
`apps/web`; **os dois builds embutem a URL de produção via `--dart-define`**, que
é resolvido em tempo de compilação (`String.fromEnvironment`) — não dá para trocar
depois sem recompilar.

| | |
|---|---|
| Bundle / applicationId | `com.lanchesdobarba.barbacue` |
| Apple Team (distribuição) | `3A3X2G4UPK` — único com cert "Apple Distribution" |
| Apple Team (pessoal, NÃO publica) | `Y5B2NQ244A` |
| App Store Connect app id | `6782376058` |
| API de produção | `https://barbacue.cog.ia.br` |
| Play package | `com.lanchesdobarba.barbacue` |

## Credenciais (nenhuma no repositório)

| O quê | Onde | Usado por |
|---|---|---|
| ASC API key + issuer | `~/.appstoreconnect/api_key.json` + `~/.appstoreconnect/private_keys/AuthKey_LUC9NT26C9.p8` | `scripts/asc.py`, `xcrun altool` |
| Service account Play | `~/Downloads/play-store-credentials.json` (ou `$PLAY_CREDENTIALS`) | `scripts/play.py` |
| Keystore de upload | `android/app/upload-keystore.jks` + `android/key.properties` | build do AAB |

> O keystore e o `key.properties` estão no `.gitignore` e **não** são versionados.
> A senha **não** fica documentada aqui — está no `key.properties` local. Faça
> backup do `.jks` num cofre (1Password): perdê-lo significa nunca mais publicar
> atualização neste applicationId.
>
> ⚠️ A senha do keystore esteve em texto puro neste arquivo até 2026-07-17 e
> continua no histórico do git (commit `ad225d4`). O `.jks` nunca foi commitado,
> então sozinha ela não abre nada — mas se quiser eliminar o risco, rotacione a
> chave de upload no Play Console (Setup → App integrity → Upload key).

## Ferramentas

```bash
python3 scripts/asc.py  status | builds | create-version <v> | attach-build <v> <build> | whatsnew <v> "txt" | submit <v>
python3 scripts/play.py status | testers | upload <aab> [track] | promote <versionCode> <track>
```

Ambos leem as credenciais dos caminhos acima. `asc.py status` é a **fonte da
verdade** do estado na App Store — não confie em documentação (ver histórico).

---

## Release passo a passo

### 1. Versão

`pubspec.yaml` → `version: <nome>+<build>`. O build number precisa ser **maior que
qualquer um já enviado** em cada loja (hoje: 5). Nunca reenvie o mesmo número.

### 2. Build

```bash
cd apps/mobile
flutter build ipa --release \
  --dart-define=API_BASE_URL=https://barbacue.cog.ia.br \
  --export-options-plist=ios/ExportOptions.plist

flutter build appbundle --release \
  --dart-define=API_BASE_URL=https://barbacue.cog.ia.br
```

**Assinatura iOS é manual, de propósito.** O entitlement `associated-domains`
(deep links da mesa) exige um provisioning profile que o conceda, e a assinatura
automática só consegue criar um com uma conta Apple logada no Xcode — que não há
nesta máquina. Por isso o Release config usa `CODE_SIGN_STYLE = Manual` com o
profile **"Barbacue AppStore AssocDomains"**, criado via API.

Se o profile expirar ou sumir, recrie:

```bash
python3 - <<'PY'
import sys; sys.argv=['x']
exec(open('scripts/asc.py').read().split('if __name__')[0])
r = req('POST', '/profiles', {'data': {'type':'profiles',
  'attributes': {'name':'Barbacue AppStore AssocDomains','profileType':'IOS_APP_STORE'},
  'relationships': {'bundleId': {'data':{'type':'bundleIds','id':'VXGMA7WHHK'}},
                    'certificates': {'data':[{'type':'certificates','id':'XRYMHZXS64'}]}}}})
import base64; open('/tmp/p.mobileprovision','wb').write(base64.b64decode(r['data']['attributes']['profileContent']))
print('uuid', r['data']['attributes']['uuid'])
PY
cp /tmp/p.mobileprovision ~/Library/MobileDevice/Provisioning\ Profiles/<uuid>.mobileprovision
```

Confira que o entitlement entrou no binário assinado (não confie no build passar):

```bash
unzip -q build/ios/ipa/barbacue.ipa -d /tmp/c && \
  codesign -d --entitlements :- /tmp/c/Payload/*.app | grep associated-domains
```

### 3. Upload

```bash
xcrun altool --upload-app --type ios -f build/ios/ipa/barbacue.ipa \
  --apiKey LUC9NT26C9 --apiIssuer 4f4199ba-5938-4024-aa3d-7adfdf7bfbd1

python3 scripts/play.py upload build/app/outputs/bundle/release/app-release.aab internal
python3 scripts/play.py promote <versionCode> alpha   # trilha do teste fechado
```

Processamento na Apple: ~5–15 min. Acompanhe com `asc.py status` até `VALID`.

### 4. Submeter (iOS)

```bash
python3 scripts/asc.py create-version 1.2.0
python3 scripts/asc.py attach-build 1.2.0 5
python3 scripts/asc.py whatsnew 1.2.0 "..."
python3 scripts/asc.py submit 1.2.0        # releaseType=AFTER_APPROVAL
```

> **Nunca submeta com a produção fora do ar.** O app é 100% servido pela API: o
> revisor abrindo um app sem cardápio é rejeição quase certa por 2.1 (App
> Completeness). Cheque antes:
> `curl -sf https://barbacue.cog.ia.br/api/store-status`

---

## Deep links da mesa (dine-in)

O QR impresso aponta para `https://barbacue.cog.ia.br/mesa/<token>`. A
câmera do próprio celular abre a URL e o SO roteia para o app — sem scanner
embutido, sem permissão de câmera.

Para funcionar, **os dois arquivos precisam estar no ar em produção**:

| Arquivo | Exigência |
|---|---|
| `/.well-known/apple-app-site-association` | `Content-Type: application/json` (garantido por `next.config.ts`), sem redirect, sem extensão |
| `/.well-known/assetlinks.json` | precisa conter o SHA-256 da **chave de assinatura do Play**, não da chave de upload |

> ⚠️ **Pendência conhecida:** `assetlinks.json` hoje carrega a fingerprint da
> chave de *upload*. Com o Play App Signing ligado (padrão, e obrigatório para
> apps criados depois de 2021) o Google **re-assina** o app com outra chave, então
> a verificação falha **em silêncio** e todo QR abre o Chrome em vez do app.
> Pegue o valor em Play Console → Setup → App integrity → App signing → SHA-256 e
> acrescente ao array (ele aceita várias). O iOS não tem esse problema.

Verificação depois do deploy:

```bash
curl -sI https://barbacue.cog.ia.br/.well-known/apple-app-site-association | grep -i content-type
curl -s  https://barbacue.cog.ia.br/.well-known/assetlinks.json
```

---

## Android: produção está travada por política, não por bug

Rollout de produção retorna `FAILED_PRECONDITION` enquanto o Google não liberar
**production access**. Conta pessoal exige **12+ testers com opt-in feito, rodando
o app por 14 dias corridos** em teste fechado.

Estado (ver `TESTERS_OPTIN.md`): **12 convidados, 0 opt-in** → o relógio de 14
dias **ainda não começou**. Nenhum script destrava isso; depende de 12 pessoas
reais entrarem em
<https://play.google.com/apps/testing/com.lanchesdobarba.barbacue> com **a mesma
conta Google** da lista `HirableAITesters`.

Depois de liberado: Play Console → Production → Create new release → escolher o
`versionCode` já na biblioteca → Start rollout.

---

## Ficha das lojas

- Copy pt-BR: `store-assets/store-listing-v1.1.md`
- Ícone 512, feature graphic 1024×500: `store-assets/play/`
- Screenshots: `store-assets/screenshots/` e `store-assets/screenshots-v1.1/`
  (iPhone 6.5"/6.9" + iPad 13" — o slot iPad é **obrigatório** se o app declara
  suporte a iPad)
- Política de privacidade: <https://barbacue.cog.ia.br/privacy.html>
