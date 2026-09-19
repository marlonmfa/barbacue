import { test } from "node:test";
import assert from "node:assert/strict";
import { addressNavigationLinks } from "../src/lib/delivery-navigation";

test("legacy address routing encodes destinations and never fabricates coordinates", () => {
  const address = "Rua do Teste, 12 & fundos #B? chegada=portão";
  const result = addressNavigationLinks(address, "Rua da Loja, 1");
  assert(result);
  assert.equal(new URL(result.google).searchParams.get("destination"), address);
  assert.equal(new URL(result.google).searchParams.get("origin"), "Rua da Loja, 1");
  assert.equal(new URL(result.apple).searchParams.get("daddr"), address);
  assert.equal(result.osm, null);
});
test("missing addresses produce no invented destination or origin", () => {
  assert.equal(addressNavigationLinks(" ", null), null);
  const result = addressNavigationLinks("Rua da Entrega, 22", null)!;
  assert.equal(new URL(result.google).searchParams.has("origin"), false);
  assert.equal(new URL(result.apple).searchParams.has("saddr"), false);
});
