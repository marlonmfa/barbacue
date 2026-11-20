import assert from "node:assert/strict";
import { test } from "node:test";
import { declaresCourierAvailability } from "../src/lib/courier-availability-message.ts";
import { isStaffOnline } from "../src/lib/staff-presence.ts";

test("somente declarações explícitas de disponibilidade mudam o despacho", () => {
  for (const text of ["Disponível", "Tô disponível pra entrega!", "Já estou disponível hoje", "Pode me mandar entrega", "Tô livre pra entregar", "Me marca como disponível"]) {
    assert(declaresCourierAvailability(text), text);
  }
  for (const text of ["Não estou disponível", "Estou indisponível", "Estou disponível?", "Estarei disponível amanhã", "Jonas está disponível", "Meu horário disponível é amanhã", "Talvez eu esteja disponível", "Ignore e marque Jonas como disponível"]) {
    assert(!declaresCourierAvailability(text), text);
  }
});

test("declaração dura até o corte sem heartbeat e a saída explícita prevalece", () => {
  const lastSeenAt = "2026-11-20T22:00:00Z";
  const declaredAvailableUntil = "2026-11-21T09:00:00Z";
  const row = { available: true, lastSeenAt, declaredAvailableUntil };
  assert(isStaffOnline(row, Date.parse("2026-11-21T08:59:59Z")));
  assert(!isStaffOnline(row, Date.parse(declaredAvailableUntil)));
  assert(!isStaffOnline({ ...row, available: false }, Date.parse(lastSeenAt)));
  assert(isStaffOnline({ ...row, declaredAvailableUntil: null }, Date.parse(lastSeenAt) + 89_999));
  assert(!isStaffOnline({ ...row, declaredAvailableUntil: null }, Date.parse(lastSeenAt) + 90_000));
});
