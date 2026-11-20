// Preload this fixture only in the isolated Logistics integration server.
const { appendFileSync } = require("node:fs");
const assert = require("node:assert/strict");

assert(process.env.IFOOD_TEST_TRACE);
assert.equal(process.env.IFOOD_CLIENT_ID, "operational-fixture");
assert.equal(process.env.IFOOD_LOGISTICS_CLIENT_ID, "logistics-fixture");

const realFetch = globalThis.fetch;
const orderId = "97bf281a-e571-41c8-b240-dcc3bee76097";
const merchantId = "403af0c6-176b-4021-a6cd-3e09dca09cbf";
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname !== "merchant-api.ifood.com.br") return realFetch(input, options);
  if (url.pathname === "/authentication/v1.0/oauth/token") {
    const client = new URLSearchParams(options.body).get("clientId");
    assert(["operational-fixture", "logistics-fixture"].includes(client));
    return Response.json({ accessToken: client, expiresIn: 3600 });
  }
  const [, area, , , external, action] = url.pathname.split("/");
  assert(["order", "logistics"].includes(area));
  assert.equal(external, orderId);
  const credential = area === "order" ? "operational-fixture" : "logistics-fixture";
  assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${credential}`);
  if (options.method === "GET" && area === "logistics") {
    return Response.json({ id: orderId, merchant: { id: merchantId }, delivery: { deliveredBy: "MERCHANT" } });
  }
  assert.equal(options.method, "POST");
  // Track the module and action only. The code and driver details stay out of logs.
  appendFileSync(process.env.IFOOD_TEST_TRACE, `${area}/${action}\n`);
  if (action === "verifyDeliveryCode" && JSON.parse(options.body).code !== "1234") {
    return Response.json({ message: "Código inválido" }, { status: 422 });
  }
  return new Response(null, { status: 202 });
};
