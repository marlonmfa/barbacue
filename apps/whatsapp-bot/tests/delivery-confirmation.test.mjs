import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

let enabled, quote, chatResult, orders, chatCalls, quoteCalls, loseOrderResponse;
let handleMessage;
let phone = 0;
before(async () => {
  mock.module("../dist/api-client.js", { namedExports: {
    chat: async () => { chatCalls++; return structuredClone(chatResult); },
    getStoreStatus: async () => ({ open: true }),
    deliveryEnabled: async () => enabled,
    quoteDelivery: async () => { quoteCalls++; if (quote instanceof Error) throw quote; return { ...quote }; },
    createOrder: async payload => { orders.push(payload); if (loseOrderResponse) throw new TypeError("Connection lost after commit"); return { orderId: "test-order", totalCents: 3675, deliveryFeeCents: payload.deliveryQuoteId ? 675 : 0, paymentMethod: "cash", pix: null }; },
  }});
  ({ handleMessage } = await import("../dist/conversation.js"));
});
beforeEach(() => {
  enabled = true; orders = []; chatCalls = 0; quoteCalls = 0;
  loseOrderResponse = false;
  quote = { quoteId: "test-quote", address: "Rua Teste, 123, Centro, São Paulo", distanceMeters: 3750, durationSeconds: 660, feeCents: 675, expiresAt: new Date(Date.now() + 900000).toISOString() };
  chatResult = { reply: "Confira o pedido.", cart: [{ productId: 1, name: "Lanche", qty: 1, priceCents: 3000 }], customer: { name: "Cliente Teste", phone: "11999990000", address: quote.address }, paymentMethod: "cash", navigate: true };
});
async function prepare() {
  const contact = `delivery-test-${++phone}`;
  await handleMessage(contact, "barbacue");
  const result = await handleMessage(contact, "Quero finalizar");
  return { contact, result };
}

test("WhatsApp presents road distance and fee before sending an order", async () => {
  const { contact, result } = await prepare();
  assert.equal(orders.length, 0);
  assert.match(result.messages.join("\n"), /3,75 km/);
  assert.match(result.messages.join("\n"), /6,75/);
  assert.match(result.messages.join("\n"), /36,75/);
  assert.match(result.messages.join("\n"), /CONFIRMAR ENTREGA/);
  const accepted = await handleMessage(contact, "CONFIRMAR ENTREGA");
  assert.equal(orders.length, 1);
  assert.equal(orders[0].deliveryQuoteId, "test-quote");
  assert.equal(chatCalls, 1, "confirmation bypasses AI and submits exactly the reviewed state");
  assert.match(accepted.messages.join("\n"), /Frete incluído/);
});

test("editing the address obtains a new quote and requires another confirmation", async () => {
  const { contact } = await prepare();
  chatResult.customer.address = "Rua Nova, 456, Centro, São Paulo";
  quote = { ...quote, quoteId: "new-quote", address: chatResult.customer.address, feeCents: 950 };
  const edited = await handleMessage(contact, "Mudar endereço para Rua Nova, 456");
  assert.equal(orders.length, 0);
  assert.equal(quoteCalls, 2);
  assert.match(edited.messages.join("\n"), /9,50/);
  await handleMessage(contact, "confirmar entrega");
  assert.equal(orders[0].deliveryQuoteId, "new-quote");
  assert.equal(orders[0].deliveryAddress, chatResult.customer.address);
});

test("an expired quote is recalculated without automatically charging its new fee", async () => {
  quote.expiresAt = new Date(Date.now() - 1000).toISOString();
  const { contact } = await prepare();
  quote = { ...quote, quoteId: "renewed-quote", feeCents: 1100, expiresAt: new Date(Date.now() + 900000).toISOString() };
  const renewed = await handleMessage(contact, "confirmar entrega");
  assert.equal(orders.length, 0);
  assert.match(renewed.messages.join("\n"), /expirou/);
  assert.match(renewed.messages.join("\n"), /11,00/);
  await handleMessage(contact, "confirmar entrega");
  assert.equal(orders[0].deliveryQuoteId, "renewed-quote");
});

test("unavailable routes block order creation and disabled freight preserves checkout", async () => {
  quote = Object.assign(new Error("Este endereço está fora da área de entrega."), { status: 422 });
  const { result } = await prepare();
  assert.equal(orders.length, 0);
  assert.match(result.messages.join("\n"), /fora da área/);
  enabled = false;
  await prepare();
  assert.equal(orders.length, 1);
  assert.equal(orders[0].deliveryQuoteId, undefined);
});

test("concurrent repeated confirmations cannot submit the same cart twice", async () => {
  const { contact } = await prepare();
  chatResult = { ...chatResult, cart: [], navigate: false, reply: "Seu pedido já foi enviado." };
  await Promise.all([handleMessage(contact, "confirmar entrega"), handleMessage(contact, "confirmar entrega")]);
  assert.equal(orders.length, 1);
});

test("a lost order response cannot resend the same cart through another confirmation", async () => {
  const { contact } = await prepare();
  loseOrderResponse = true;
  const uncertain = await handleMessage(contact, "confirmar entrega");
  assert.match(uncertain.messages.join("\n"), /pode já ter entrado/);
  await handleMessage(contact, "confirmar entrega");
  await handleMessage(contact, "Barbadog, confirmar entrega");
  assert.equal(orders.length, 1, "an uncertain commit must never be repeated automatically");
  assert.equal(chatCalls, 1, "the AI cannot bypass the uncertain-outcome guard");
  const next = await handleMessage(contact, "novo pedido");
  assert.match(next.messages.join("\n"), /começar outra compra/);
  assert.equal(orders.length, 1, "starting another purchase does not reuse or send the old cart");
});
