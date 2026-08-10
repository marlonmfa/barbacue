// Unit tests for the /beta signup validation + WhatsApp normalization.
//
//   ../../node_modules/.bin/tsx --test tests/beta-validation.test.ts
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWhatsapp, betaSignupSchema } from "../src/lib/beta-validation";

test("normalizeWhatsapp: formatted BR mobile → 55 + digits", () => {
  assert.equal(normalizeWhatsapp("(11) 98888-7777"), "5511988887777");
  assert.equal(normalizeWhatsapp("11 98888 7777"), "5511988887777");
  assert.equal(normalizeWhatsapp("11988887777"), "5511988887777");
});

test("normalizeWhatsapp: already has country code (with/without +)", () => {
  assert.equal(normalizeWhatsapp("+55 11 98888-7777"), "5511988887777");
  assert.equal(normalizeWhatsapp("5511988887777"), "5511988887777");
});

test("normalizeWhatsapp: 10-digit landline (WhatsApp Business) accepted", () => {
  assert.equal(normalizeWhatsapp("(11) 3333-4444"), "551133334444");
});

test("normalizeWhatsapp: rejects garbage", () => {
  assert.equal(normalizeWhatsapp(""), null);
  assert.equal(normalizeWhatsapp("123"), null);
  assert.equal(normalizeWhatsapp("119888877771234"), null); // too long
  assert.equal(normalizeWhatsapp("(01) 98888-7777"), null); // DDD can't contain 0
  assert.equal(normalizeWhatsapp("11888887777"), null); // 11 digits must start with 9
  assert.equal(normalizeWhatsapp("4911988887777"), null); // 13 digits but not BR (49=DE)
});

test("betaSignupSchema: valid payload passes and is normalized", () => {
  const parsed = betaSignupSchema.parse({
    name: "  Maria Silva  ",
    whatsapp: "(11) 98888-7777",
    email: "Maria@Email.COM ",
    platform: "android",
  });
  assert.equal(parsed.name, "Maria Silva");
  assert.equal(parsed.whatsapp, "5511988887777");
  assert.equal(parsed.email, "maria@email.com");
  assert.equal(parsed.platform, "android");
});

test("betaSignupSchema: rejects bad email, bad phone, missing platform", () => {
  const base = {
    name: "Maria",
    whatsapp: "(11) 98888-7777",
    email: "maria@email.com",
    platform: "ios",
  };
  assert.equal(betaSignupSchema.safeParse({ ...base, email: "nope" }).success, false);
  assert.equal(betaSignupSchema.safeParse({ ...base, whatsapp: "12" }).success, false);
  assert.equal(betaSignupSchema.safeParse({ ...base, platform: "windows" }).success, false);
  assert.equal(betaSignupSchema.safeParse({ ...base, name: "A" }).success, false);
});

test("betaSignupSchema: error messages are human pt-BR", () => {
  const res = betaSignupSchema.safeParse({
    name: "Maria",
    whatsapp: "12",
    email: "maria@email.com",
    platform: "ios",
  });
  assert.equal(res.success, false);
  if (!res.success) {
    assert.match(res.error.issues[0].message, /WhatsApp inválido/);
  }
});
