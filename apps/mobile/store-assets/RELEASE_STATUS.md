# Estado do release — v1.2.0 (build 5)

Atualizado: 2026-07-17. **Sempre confirme com `python3 scripts/asc.py status` e
`python3 scripts/play.py status`** antes de agir — este arquivo envelhece, a API não.

## Resumo

| Frente | Estado | Detalhe |
|---|---|---|
| Código (paridade com a web) | ✅ FEITO | 91 gaps fechados. `flutter analyze` limpo; 103 testes + 13 goldens passando. Verificado no simulador contra a API real, não só em golden. |
| iOS — binário | ✅ ENVIADO | 1.2.0 (5), assinado `Apple Distribution (3A3X2G4UPK)`, entitlement `associated-domains` confirmado **dentro do IPA assinado**. |
| Android — binário | ✅ NA CONSOLE | versionCode 5 nas trilhas `internal` **e** `alpha` (teste fechado). |
| iOS — submeter p/ revisão | ⛔ SEGURAR | Bloqueado pela produção fora do ar (abaixo). |
| Android — produção | ⛔ TRAVADO | Política do Google: 12 testers × 14 dias. **0 opt-in até agora.** |
| Web (`/api/settings`, `.well-known`) | ⛔ NÃO DEPLOYADO | VPS fora do ar. |

## ⚠️ v1.1.0 foi REJEITADA (não "aguardando aprovação")

A documentação anterior registrava v1.1.0 como submetida com release automático.
A API diz outra coisa: `appStoreState = REJECTED`, submissão de 2026-07-06 em
`UNRESOLVED_ISSUES`. **O app nunca esteve na loja.**

O motivo da rejeição **não é exposto pela API** — só aparece no Resolution Center
(App Store Connect → versão 1.1.0 → ícone de mensagem). Sem ele, v1.2.0 é um
resubmit às cegas: a aposta é que a rejeição tenha sido **4.2 (Minimum
Functionality)**, o desfecho mais comum para app de cardápio, e é exatamente isso
que a paridade desta versão ataca. Se for outro motivo (privacidade, metadado,
fluxo quebrado), o ciclo de review (~24–48h) é desperdiçado.

**Leia o Resolution Center antes de submeter.**

## ⛔ Produção fora do ar (2026-07-17)

`barbacue.hirableaiagents.com` **e** `hirableaiagents.com` inacessíveis → é o VPS
inteiro (72.60.31.220), não o vhost. TCP 80/443 aceitam, mas o handshake TLS
morre; SSH:22 dá timeout; traceroute morre no backbone da Cogent. Confirmado de
duas redes distintas. Estava no ar ~1h antes (respondeu 404 em `/api/settings`).

Sem acesso SSH não há diagnóstico remoto — resolver pelo painel da Hostinger.

**Isto bloqueia o submit da Apple.** O app é 100% servido pela API; um revisor
abrindo um app sem cardápio = rejeição por 2.1 quase certa. Cheque antes:

```bash
curl -sf https://barbacue.hirableaiagents.com/api/store-status && echo OK
```

## Pendências que exigem uma pessoa

1. **Subir o VPS** (Hostinger) e depois deployar a web (`/api/settings` + `.well-known/`).
2. **Ler o Resolution Center** e confirmar/ajustar a aposta do 4.2.
3. **SHA-256 do Play App Signing** → Play Console → Setup → App integrity. Sem
   ele, `assetlinks.json` está com a fingerprint errada e os deep links do Android
   falham em silêncio (iOS não é afetado). Ver `PUBLISH.md`.
4. **12 testers fazerem opt-in** (`TESTERS_OPTIN.md`) — o relógio de 14 dias só
   começa aí. Roda em paralelo com todo o resto; quanto antes, melhor.

## Depois que a produção voltar

```bash
curl -sf https://barbacue.hirableaiagents.com/api/settings                       # 200 + 8 campos, zero pix
curl -sI https://barbacue.hirableaiagents.com/.well-known/apple-app-site-association | grep -i content-type
python3 scripts/asc.py status                                                    # build 5 VALID?
python3 scripts/asc.py create-version 1.2.0
python3 scripts/asc.py attach-build 1.2.0 5
python3 scripts/asc.py whatsnew 1.2.0 "..."
python3 scripts/asc.py submit 1.2.0
```
