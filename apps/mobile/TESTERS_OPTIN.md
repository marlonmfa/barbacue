# Opt-in dos testers — BARBACUE (teste fechado / produção)

> **Por que isso é necessário:** o Google exige, para contas pessoais, que o app
> rode em **teste fechado com pelo menos 12 testers que realmente fizeram opt-in,
> por no mínimo 14 dias**, antes de liberar o botão "Apply for production".
> Hoje há **12 testers convidados** na lista `HirableAITesters`, mas **0 fizeram
> opt-in** — por isso a produção ainda está travada. Assim que os 12 entrarem, o
> relógio de 14 dias passa a contar.

## Links

- **Entrar no teste (web — fazer primeiro):**
  https://play.google.com/apps/testing/com.lanchesdobarba.barbacue
- **Instalar o app (Android):**
  https://play.google.com/store/apps/details?id=com.lanchesdobarba.barbacue

---

## Mensagem pronta para enviar aos 12 testers

> **Assunto: Me ajuda a testar o app BARBACUE? (2 min)**
>
> Oi! Lancei o app do **BARBACUE — Burguers na Brasa** e preciso da sua ajuda
> para liberá-lo na Play Store. São 2 minutos:
>
> 1. **No celular Android**, confirme que está logado na Play Store com o **mesmo
>    e-mail Google** que você me passou (é o que está na lista de testers).
> 2. Abra este link e toque em **"Tornar-se um testador"**:
>    https://play.google.com/apps/testing/com.lanchesdobarba.barbacue
> 3. Depois abra este link e **instale o app**:
>    https://play.google.com/store/apps/details?id=com.lanchesdobarba.barbacue
> 4. **Importante:** deixe o app instalado pelos próximos 14 dias (pode abrir e
>    dar uma olhada no cardápio — ajuda muito!).
>
> Qualquer erro, me manda print. Valeu demais! 🍔🔥

---

## Checklist para acompanhar (Marlon)

- [ ] Enviar a mensagem acima para os 12 testers (WhatsApp/e-mail).
- [ ] Confirmar no Play Console → app BARBACUE → Test and release → Closed testing
      → Alpha → aba **Releases/Dashboard** que o número de "testers opted-in"
      chegou a **≥ 12**.
- [ ] A partir daí, aguardar **14 dias** com os 12 ativos.
- [ ] Quando o botão **"Apply for production"** (Dashboard do app) deixar de ficar
      cinza, clicar e responder o questionário do teste fechado.
- [ ] Após aprovação do acesso à produção, promover a release de closed testing
      para **Production** (ou criar release de produção com o mesmo AAB
      `v1.1.0 (version code 2)`, que já está no closed testing).

> Observação: os testers precisam usar **a mesma conta Google** que está na lista
> de e-mails `HirableAITesters`. Se alguém usar outra conta, o opt-in não conta.
