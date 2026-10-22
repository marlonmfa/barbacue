// Unit tests for the header brand switcher ordering/theme.
//
//   ../../node_modules/.bin/tsx --test tests/brand-switcher.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { BRANDS, BRAND_THEME, brandSwitcherOrder } from "../src/lib/brands";

test("order is always Chelas, Barbacue, Barbadog; only the domain brand is featured", () => {
  const view = (b: "barbacue" | "chelas" | "barbadog") => brandSwitcherOrder(b).map((x) => `${x.slug}:${x.featured ? "G" : "p"}`).join(" ");
  assert.equal(view("barbacue"), "chelas:p barbacue:G barbadog:p");
  assert.equal(view("chelas"), "chelas:G barbacue:p barbadog:p");
  assert.equal(view("barbadog"), "chelas:p barbacue:p barbadog:G");
});

test("every brand has its own logo, icon and colors", () => {
  for (const slug of Object.keys(BRANDS) as (keyof typeof BRANDS)[]) {
    const t = BRAND_THEME[slug];
    assert.match(t.logo, new RegExp(`/brand/icons/${slug}-`));
    assert.match(t.icon, new RegExp(`/brand/icons/${slug}-`));
    assert.match(t.background, /^#[0-9a-f]{6}$/i);
  }
});
