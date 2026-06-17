# Sistema de Pedidos — clicar, escrever e pagar

Sistema completo de pedido de lanche onde **clicar no cardápio** e **escrever para
o atendente de IA** são caminhos equivalentes que convergem na mesma página de
pagamento. Qualquer mistura entre os dois é aceita.

## Princípio central: estado compartilhado

Os dois fluxos manipulam **o mesmo estado**, então um hambúrguer adicionado por
clique é indistinguível de um adicionado por texto.

| Estado | Store | Persistência |
|--------|-------|--------------|
| Itens do carrinho | `useCart` (`src/lib/cart.ts`) | localStorage `barbacue-cart` |
| Dados do cliente + pagamento | `useCheckout` (`src/lib/checkout.ts`) | localStorage `barbacue-checkout` |

O agente de IA **não** tem carrinho próprio: o endpoint `/api/chat` recebe o
carrinho atual, executa as ferramentas sobre uma cópia de trabalho e devolve o
**estado final** (`{cart, customer, paymentMethod, navigate}`). O `ChatAgent`
sobrescreve as stores com esse resultado — idempotente, sem risco de divergência.

## Fluxos

```
Clicar:  Cardápio → ProductCard → useCart → /cart (CartClient) → useCheckout → /payment
Escrever: ChatAgent → /api/chat (OpenAI tools) → useCart + useCheckout → /payment
```

Ambos terminam em **`/payment`** (`PaymentClient.tsx`): resumo do pedido, escolha
de forma de pagamento e criação do pedido via `POST /api/orders`.

## Agente de IA — `/api/chat`

- Modelo: `OPENAI_MODEL` (padrão `gpt-4o-mini`), `temperature: 0.3`.
- O cardápio vivo é injetado no system prompt (`#id | nome | preço | categoria`)
  para o modelo **nunca** inventar produtos ou preços.
- Ferramentas: `add_item`, `set_quantity`, `remove_item`, `set_customer`,
  `set_payment_method`, `go_to_payment`.
- Loop agêntico de até 6 passos resolvendo tool calls até a resposta em texto.
- `go_to_payment` só dispara `navigate` com carrinho não-vazio **e** nome+telefone
  preenchidos (validado no servidor).
- **Lição aprendida:** o resumo do carrinho mostrado ao modelo inclui o `#id` de
  cada item — sem isso o modelo chutava IDs ao tentar "preservar" itens existentes
  e adicionava produtos errados (bug determinístico corrigido).

## Pagamento

Formas: `pix`, `cash` (dinheiro na entrega, com "troco para"), `card_on_delivery`.

**Pix** é gerado offline (`src/lib/pix.ts`) — BR Code EMV® MPM com CRC16-CCITT,
a partir da chave Pix da loja (`store_settings.pix_key`) + valor do pedido. O txid
é o `order.id` (UUID sem hífens, ≤25 chars). Não requer gateway. A imagem QR é
renderizada no cliente com `qrcode` e há botão "copia e cola".

Config da loja (`store_settings`): `pix_key`, `pix_merchant_name`,
`pix_merchant_city`.

## Schema (mudanças)

`orders`: `payment_method`, `payment_status`, `change_for_cents`, `channel`
(`click`|`chat`). `store_settings`: `pix_key`, `pix_merchant_name`,
`pix_merchant_city`.

## Variáveis de ambiente

```
OPENAI_API_KEY=...        # obrigatória para o /api/chat
OPENAI_MODEL=gpt-4o-mini  # opcional
```
Sem a chave, `/api/chat` responde 503 e o resto do site segue funcionando.
