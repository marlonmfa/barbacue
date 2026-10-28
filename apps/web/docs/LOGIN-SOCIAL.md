# Login social dos clientes (Google, Apple, Instagram e Facebook)

A página `/conta` das três marcas mostra **Entrar com Google**, **Entrar com
Apple**, **Entrar com Instagram** e **Entrar com Facebook** ao lado do login por
e-mail. Cada botão só aparece depois que as
credenciais dele estiverem no `.env` (e `ADMIN_COOKIE_SECRET` definido).

## Limitação do Instagram

A Meta encerrou a Instagram Basic Display API em 04/12/2024. O login que sobrou
(*Instagram API with Instagram Login*, escopo `instagram_business_basic`) só aceita
contas **Profissionais** (Comercial ou Criador de conteúdo). Contas pessoais
recebem erro na tela da Meta. A página avisa isso e oferece Facebook e e-mail.

## Fluxo

1. `GET /api/auth/<instagram|facebook>?returnTo=/cart` grava um cookie de estado
   assinado (10 min) e redireciona para a Meta.
2. A Meta volta em `GET /api/auth/<provedor>/callback`. O servidor confere o
   estado, troca o `code` por token, lê o perfil e cria ou acha a conta.
3. A sessão é o mesmo cookie `barbacue_member` do login por e-mail.

Vinculação de contas, nesta ordem: perfil já ligado → cliente já logado (o
perfil é anexado à conta dele) → mesmo e-mail devolvido pelo Facebook → conta
nova. O Instagram não fornece e-mail; essas contas ficam com e-mail vazio.

Só os domínios `APP_URL`/`DOMAIN_BARBA`, `DOMAIN_CHELAS` e `DOMAIN_HOTDOG`
podem iniciar o login (proteção contra Host forjado).

## Configurar o Google

1. <https://console.cloud.google.com/apis/credentials> → *Criar credenciais* →
   **ID do cliente OAuth** → tipo **Aplicativo da Web**.
2. *URIs de redirecionamento autorizados*:
   ```
   https://barbacue.cog.ia.br/api/auth/google/callback
   https://chelas.hirableaiagents.com/api/auth/google/callback
   https://barbadog.hirableaiagents.com/api/auth/google/callback
   ```
3. Na *Tela de consentimento OAuth* use os escopos `openid`, `email` e `profile`
   (não exigem verificação) e publique o app (*Em produção*).
4. `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no ambiente do servidor.

## Configurar a Apple

1. <https://developer.apple.com/account/resources/identifiers> → o App ID do app
   iOS precisa ter **Sign in with Apple** ligado.
2. Crie um **Services ID** (ex.: `br.ia.cog.barbacue.web`), ligue *Sign in with
   Apple* → *Configure*: App ID principal = o do app iOS; *Domains*
   `barbacue.cog.ia.br`, `chelas.hirableaiagents.com`, `barbadog.hirableaiagents.com`;
   *Return URLs* = `https://<domínio>/api/auth/apple/callback` para cada um.
3. *Keys* → nova chave com **Sign in with Apple** → baixe o `.p8` (só uma vez).
4. No ambiente: `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID` e
   `APPLE_PRIVATE_KEY` (conteúdo do `.p8`, com quebras de linha como `\n`).

A Apple volta por **POST** (`response_mode=form_post`), por isso o cookie de
estado desse provedor usa `SameSite=None; Secure`. O nome só vem no primeiro
login; o e-mail pode ser um endereço `privaterelay.appleid.com`.

Google e Apple só vinculam a uma conta existente pelo e-mail quando o provedor
marca o e-mail como confirmado.

## Configurar no Meta for Developers

1. Em <https://developers.facebook.com/apps>, crie um app do tipo **Business**
   (ou use um existente).
2. **Facebook Login** → *Settings* → **Valid OAuth Redirect URIs**:
   ```
   https://barbacue.cog.ia.br/api/auth/facebook/callback
   https://chelas.hirableaiagents.com/api/auth/facebook/callback
   https://barbadog.hirableaiagents.com/api/auth/facebook/callback
   ```
   Copie *App ID* e *App Secret* (Configurações → Básico) para
   `FACEBOOK_APP_ID` e `FACEBOOK_APP_SECRET`.
3. Adicione o produto **Instagram** → *API setup with Instagram login* →
   *Set up Instagram business login* → **Business login settings** → em
   *OAuth redirect URIs* cadastre:
   ```
   https://barbacue.cog.ia.br/api/auth/instagram/callback
   https://chelas.hirableaiagents.com/api/auth/instagram/callback
   https://barbadog.hirableaiagents.com/api/auth/instagram/callback
   ```
   Use o **Instagram app ID** e o **Instagram app secret** mostrados nessa tela
   (são diferentes dos do app Meta) em `INSTAGRAM_APP_ID` e
   `INSTAGRAM_APP_SECRET`.
4. Em Configurações → Básico preencha os domínios do app, a política de
   privacidade (`/legal/<marca>/privacy.html`) e a exclusão de dados
   (`/legal/<marca>/data-deletion.html`).
5. Enquanto o app estiver em modo *Development*, só administradores, devs e
   testadores do app conseguem entrar. Para o público, coloque o app em modo
   *Live*. `public_profile`, `email` e `instagram_business_basic` podem exigir
   *App Review* e verificação da empresa.
6. Faça o deploy: `docker compose up -d --build` (o serviço `migrate` aplica a
   migrações `0015_social_login` e `0016_google_apple_login`).

## Testes

```
cd apps/web && ../../node_modules/.bin/tsx --test tests/social-auth.test.ts
```
