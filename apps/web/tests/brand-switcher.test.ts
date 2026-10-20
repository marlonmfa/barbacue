// Unit tests for the header brand switcher ordering/theme.
//
//   ../../node_modules/.bin/tsx --test tests/brand-switcher.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { BRANDS, BRAND_THEME, brandSwitcherOrder } from "../src/lib/brands";

test("current brand is featured and the other two follow", () => {
  assert.deepEqual(brandSwitcherOrder("chelas"), { current: "chelas", others: ["barbacue", "barbadog"] });
  assert.deepEqual(brandSwitcherOrder("barbadog"), { current: "barbadog", others: ["barbacue", "chelas"] });
  assert.deepEqual(brandSwitcherOrder("barbacue").others, ["chelas", "barbadog"]);
});

test("every brand has its own logo, icon and colors", () => {
  for (const slug of Object.keys(BRANDS) as (keyof typeof BRANDS)[]) {
    const t = BRAND_THEME[slug];
    assert.match(t.logo, new RegExp(`/brand/icons/${slug}-`));
    assert.match(t.icon, new RegExp(`/brand/icons/${slug}-`));
    assert.match(t.background, /^#[0-9a-f]{6}$/i);
  }
});
