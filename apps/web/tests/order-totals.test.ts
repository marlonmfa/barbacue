import { test } from "node:test";
import assert from "node:assert/strict";
import { orderTotalCents } from "../src/lib/order-totals.ts";

test("freight is included after discounts, including a fully discounted meal", () => {
  assert.equal(orderTotalCents(4000, 500, 950), 4450);
  assert.equal(orderTotalCents(4000, 4000, 950), 950);
  assert.equal(orderTotalCents(4000, 9000, 950), 950);
  assert.equal(orderTotalCents(4000, 500), 3500);
});
test("invalid monetary values and integer overflow are rejected", () => {
  for (const fee of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => orderTotalCents(4000, 0, fee), RangeError);
  assert.throws(() => orderTotalCents(-100, 0, 0), RangeError);
});
