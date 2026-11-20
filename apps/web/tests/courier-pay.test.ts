import assert from "node:assert/strict";
import { test } from "node:test";
import { courierDistanceBonus, courierOperatingDay, summarizeCourierPay, validOperatingDay } from "../src/lib/courier-pay.ts";
import { defaultDispatchConfig, planDispatch } from "../src/lib/dispatch-planner.ts";

test("a arrancada inclui dez entregas e quilometragem acima do limite conta integralmente", () => {
  assert.equal(courierDistanceBonus(5000), 0);
  assert.equal(courierDistanceBonus(5001), 500);
  assert.equal(courierDistanceBonus(5300), 530);
  assert.equal(courierDistanceBonus(10000), 1000);
  assert.equal(courierDistanceBonus(null), null);
  assert.equal(courierDistanceBonus(0), null);
  const firstTen = Array.from({ length: 10 }, () => ({ distanceMeters: 3000 }));
  assert.equal(summarizeCourierPay(firstTen).totalCents, 11000);
  const result = summarizeCourierPay([...firstTen, { distanceMeters: 5300 }, { distanceMeters: 10000 }, { distanceMeters: null }]);
  assert.equal(result.extraDeliveries, 3);
  assert.equal(result.extraCents, 1800);
  assert.equal(result.distanceCents, 1530);
  assert.equal(result.totalCents, 14330);
  assert.equal(result.pendingDistances, 1);
  assert.equal(result.deliveries[10].extraCents, 600);
  assert.equal(result.deliveries[10].distanceBonusCents, 530);
});

test("turno confirmado sem entrega recebe arrancada e a madrugada fecha no mesmo dia operacional", () => {
  assert.equal(summarizeCourierPay([]).totalCents, 0);
  assert.equal(summarizeCourierPay([], true).totalCents, 11000);
  assert.equal(summarizeCourierPay([{ distanceMeters: 1000 }], true).totalCents, 11000);
  assert.equal(courierOperatingDay(new Date("2026-11-21T08:59:59Z")), "2026-11-20");
  assert.equal(courierOperatingDay(new Date("2026-11-21T09:00:00Z")), "2026-11-21");
  assert.equal(validOperatingDay("2026-02-30"), false);
  assert.equal(validOperatingDay("2026-11-20"), true);
});

test("distância para remuneração é loja–destino, inclusive nas paradas seguintes do roteiro", () => {
  const order = (id: string) => ({ id, address: id, brand: "barbacue", placedAt: 0, scheduledAt: null, point: { latitude: -26, longitude: -49 } });
  const matrix = [[0, 5300, 10000], [5300, 0, 700], [10000, 700, 0]]
    .map(row => row.map(distanceMeters => ({ distanceMeters, durationSeconds: Math.round(distanceMeters / 10) })));
  const { plans } = planDispatch([order("a"), order("b")], matrix, defaultDispatchConfig, 0);
  assert.equal(plans.length, 1);
  const second = plans[0].stops[1];
  assert.equal(second.leg.distanceMeters, 700);
  assert.equal(second.originDistanceMeters, second.id === "b" ? 10000 : 5300);
});
