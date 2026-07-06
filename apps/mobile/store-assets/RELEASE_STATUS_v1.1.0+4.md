# Status de release — v1.1.0 (build 4)

Data: 2026-07-05. Esta build carrega o backfill de fotos do cardápio (todos os 197
itens com foto) e a correção do app para exibir as fotos servidas por caminho
relativo (`/generated/products/…`).

## Resumo do que foi feito automaticamente

| Frente | Estado | Detalhe |
|---|---|---|
| **Web (produção)** | ✅ NO AR | Fotos deployadas em `/root/barbacue/apps/web/public/generated/` + 107 `image_url` atualizados no banco de produção (host `:5432`). PM2 reiniciado. Verificado: 105 fotos na home, 0 quebradas. |
| **iOS — upload** | ✅ FEITO | Build **1.1.0 (4)** enviada e **processada (VALID)** no App Store Connect via API key. Assinada com `Apple Distribution (3A3X2G4UPK)`, export-compliance OK. |
| **Android — upload** | ✅ NA CONSOLE | Build **1.1.0 (4)** (versionCode 4) publicada na trilha **internal testing** via service account. Instalável por testers agora. |
| **iOS — submeter p/ revisão** | ✅ SUBMETIDO | v1.1.0 (4) em `WAITING_FOR_REVIEW`, release automático na aprovação (~24–48h). Todos os 3 bloqueios resolvidos via API: build anexada, screenshots iPad 13" (3) e iPhone 6.5" (3), contact info, export compliance. Nada manual restante. |
| **Android — produção** | ⏳ MANUAL | Rollout de produção bloqueado por `FAILED_PRECONDITION` (setup da ficha/produção incompleto). |

Artefatos locais (build 4): `apps/mobile/build/app/outputs/bundle/release/app-release.aab`,
`.../flutter-apk/app-release.apk`, `apps/mobile/build/ios/ipa/barbacue.ipa`.

---

## Por que os passos finais NÃO podem ser automatizados

O upload dos binários foi feito com as credenciais que já estão nesta máquina
(App Store Connect API key `LUC9NT26C9`; service account Google Play
`play-store-publisher@…`). Mas **colocar de fato nas lojas** exige ações de painel
web que a Apple e o Google só permitem para uma pessoa logada, com 2FA, aceitando
termos legais em nome do negócio. São irreversíveis/públicas — por isso ficam com
o dono.

---

## iOS — CONCLUÍDO (submetido em 2026-07-06)

Nada manual restante. Feito automaticamente via App Store Connect API:
- Build **1.1.0 (4)** anexada à versão (VALID).
- **Screenshots iPad 13"** (2064×2752) capturados via `lib/main_screenshot.dart` e
  enviados (3 imagens: menu/carrinho/pagamento) — bloqueio #2 resolvido.
- iPhone 6.5": 3 screenshots já presentes.
- **Contact Information** já preenchida (Marlon Alcantara) — bloqueio #3 resolvido.
- **Export compliance** no binário — bloqueio #1 resolvido.
- **Submetido para revisão** (`releaseType=AFTER_APPROVAL`): assim que a Apple
  aprovar, o app **publica sozinho**. Acompanhe em App Store Connect. Se quiser
  cancelar antes da revisão: App Store Connect → versão → *Remove from Review*.

---

## Android — o que falta (Google Play Console)

A build 4 está na trilha **internal testing**. A tentativa de criar a release de
**produção** via API voltou `FAILED_PRECONDITION`: o Google não aceita release de
produção enquanto o setup do app não estiver completo. Complete em
https://play.google.com/console → BARBACUE:

1. **Dashboard → Set up your app**: fechar todos os itens com `!` — App access,
   Ads, **Content rating**, **Target audience**, **Data safety**, Privacy policy
   (`https://barbacue.hirableaiagents.com/privacy.html`), News app, Government apps.
2. **Store listing**: nome, descrição curta/completa, ícone 512, feature graphic
   1024×500 (`store-assets/play/feature_graphic_1024x500.png`), screenshots
   (`store-assets/screenshots/play/`).
3. **Production access**: contas pessoais criadas recentemente precisam rodar
   **closed testing com 12+ testers por 14 dias** antes de liberar produção. O app
   já tem trilha `alpha` (v2) e `internal` (v4) — use-as para cumprir esse requisito.
4. Depois: **Production → Create new release** → o bundle **versionCode 4** já está
   disponível na biblioteca → **Review release → Start rollout to production**.

> Reexecutar o upload (nova build): rode os scripts em `scripts/prepare_release.sh`
> e reutilize os utilitários de upload em `store-assets/` (ver histórico do git).
> Suba sempre um `versionCode`/`build number` maior que o último enviado.
