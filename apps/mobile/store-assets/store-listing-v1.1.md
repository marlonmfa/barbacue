# Ficha das lojas — BARBACUE v1.1.0

Backend de produção: **https://barbacue.hirableaiagents.com** (já no ar).
Política de privacidade: **https://barbacue.hirableaiagents.com/privacy.html** (já no ar).

## Nome do app
**BARBACUE — Burguers na Brasa**

## Descrição curta (Play, máx. 80 caracteres)
Peça hambúrguer artesanal na brasa: clique no cardápio ou peça pelo chat com IA.

## Descrição completa (Play / App Store)
O BARBACUE é a forma mais rápida de pedir o seu hambúrguer artesanal na brasa em
Jaraguá do Sul. 🍔🔥

**Peça do seu jeito — clicando OU conversando:**
- 🛒 Navegue pelo cardápio completo e monte seu pedido no toque.
- 💬 Ou converse com nosso atendente de IA: escreva o que você quer (“quero 2
  X-Burguer e uma Coca”) e ele anota tudo e te leva direto pro pagamento.
- Misture os dois à vontade — o que você clica e o que você escreve vão pro mesmo
  carrinho.

**Pagamento fácil:**
- ⚡ Pix na hora (QR Code + copia e cola).
- 💵 Dinheiro na entrega (com troco).
- 💳 Cartão na entrega.

**Recursos:**
- Cardápio sempre atualizado com fotos e preços.
- Cupons de desconto.
- Acompanhe seu pedido pelo WhatsApp.

Baixe e mate sua fome com o melhor burger na brasa da região!

## "Novidades desta versão" (release notes v1.1.0)
- 🤖 Novo atendente de IA: faça seu pedido conversando por texto.
- 💳 Pagamento com Pix (QR Code + copia e cola), dinheiro ou cartão na entrega.
- 🎨 Novo ícone e visual.
- Diversas melhorias de estabilidade.

## Categoria / classificação
- Categoria: Comida e bebida (Food & Drink)
- Classificação de conteúdo: Livre / 4+
- Contém anúncios: Não · Compras no app: Não

## Screenshots
**Set de submissão (pronto, válido):** `screenshots/play/` (1080×1920, 3 imagens) e
`screenshots/appstore/` (1320×2868 = iPhone 6.9", 3 imagens) — menu, carrinho,
confirmação, capturados na v1.0 com imagens de produtos carregadas. Atendem o mínimo
das duas lojas (≥2 por dispositivo) e podem ser usados para publicar.

**Recaptura v1.1 (melhoria, não bloqueia):** `screenshots-v1.1/01_menu_6.9.png`
(1320×2868) capturado no simulador iPhone 17 Pro Max com o app v1.1 apontando para
produção — mostra os cards corrigidos (sem overflow) e o botão "Pedir pelo chat".
As imagens dos produtos aparecem como placeholder porque o CDN da anota.ai não
responde a partir do simulador iOS (em terminal/dispositivo as URLs retornam 200).

**Para screenshots de marketing finais (chat IA + tela Pix com QR):** capturar num
**dispositivo físico** (onde o CDN carrega as fotos), rodando:
`flutter run --release --dart-define=API_BASE_URL=https://barbacue.hirableaiagents.com`
Telas a capturar: cardápio, chat de IA com pedido em andamento, pagamento com QR Pix.
