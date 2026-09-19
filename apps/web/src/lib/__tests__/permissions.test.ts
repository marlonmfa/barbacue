import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessPath, effectivePermissions, landingPath, offerApplies, PERMISSIONS } from "../permissions.ts";
test("kitchen has only preparation access and lands in its queue", () => {
  const user = { role: "kitchen" as const };
  assert.deepEqual(effectivePermissions(user), ["kitchen"]);
  assert.equal(landingPath(user), "/admin/kitchen");
  for (const path of ["/admin/kitchen", "/api/admin/kitchen"]) assert.equal(canAccessPath(user, path), true);
  for (const path of ["/admin/orders", "/api/admin/orders/123", "/api/admin/customers", "/api/admin/staff", "/admin", "/whatsapp", "/api/admin/unmapped"]) assert.equal(canAccessPath(user, path), false, path);
});
test("explicit permissions replace profile defaults, including an empty list", () => {
  assert.deepEqual(effectivePermissions({ role: "manager", permissions: [] }), []);
  assert.equal(landingPath({ role: "manager", permissions: [] }), "/admin/workspace");
  assert.equal(canAccessPath({ role: "cashier", permissions: ["kitchen"] }, "/admin/orders"), false);
  assert.equal(canAccessPath({ role: "employee", permissions: ["kitchen"] }, "/admin/kitchen"), true);
});
test("administrators retain access management regardless of customized list", () => {
  assert.equal(canAccessPath({ role: "admin", permissions: [] }, "/api/admin/staff/4"), true);
  assert.equal(effectivePermissions({ role: "admin", permissions: [] }).length, PERMISSIONS.length);
  assert.equal(canAccessPath({ role: "manager" }, "/admin/team"), false);
});
test("offer audiences distinguish an authenticated member from a visitor", () => {
  for (const member of [true, false]) assert.equal(offerApplies("all", member), true);
  assert.equal(offerApplies("member", true), true);
  assert.equal(offerApplies("member", false), false);
  assert.equal(offerApplies("visitor", false), true);
  assert.equal(offerApplies("visitor", true), false);
});
test("every operational profile lands at its own permitted function", () => {
  assert.equal(landingPath({ role: "cashier" }), "/admin/orders");
  assert.equal(landingPath({ role: "waiter" }), "/admin/waiter");
  assert.equal(landingPath({ role: "driver" }), "/admin/delivery");
  assert.equal(landingPath({ role: "manager" }), "/admin");
  assert.equal(landingPath({ role: "kitchen", permissions: ["kitchen", "orders"] }), "/admin/kitchen");
  assert.equal(landingPath({ role: "cashier", permissions: ["kitchen"] }), "/admin/kitchen");
  assert.equal(landingPath({ role: "waiter", permissions: [] }), "/admin/workspace");
  assert.equal(landingPath({ role: "driver", permissions: ["catalog", "offers"] }), "/admin/workspace");
});
test("floor and driver APIs do not grant general order, customer or configuration access", () => {
  const waiter = { role: "waiter" as const };
  const driver = { role: "driver" as const };
  assert.equal(canAccessPath(waiter, "/api/admin/waiter"), true);
  assert.equal(canAccessPath(driver, "/api/admin/delivery"), true);
  for (const user of [waiter, driver]) {
    for (const path of ["/api/admin/orders", "/admin/orders", "/api/admin/customers", "/api/admin/tables", "/api/admin/staff", "/admin/delivery-settings"]) {
      assert.equal(canAccessPath(user, path), false, `${user.role}: ${path}`);
    }
  }
  assert.equal(canAccessPath(waiter, "/api/admin/delivery"), false);
  assert.equal(canAccessPath(driver, "/api/admin/waiter"), false);
  assert.equal(canAccessPath({ role: "manager", permissions: [] }, "/api/admin/delivery-settings"), false);
  assert.equal(canAccessPath({ role: "manager" }, "/api/admin/delivery-settings"), true);
});

test("Windows installer page and direct download are administrator-only", () => {
  for (const path of ["/admin/downloads", "/api/admin/downloads/windows"]) {
    assert.equal(canAccessPath({ role: "admin" }, path), true);
    for (const role of ["manager", "cashier", "kitchen", "waiter", "driver", "employee"] as const) {
      assert.equal(canAccessPath({ role, permissions: PERMISSIONS.map(p => p.id) }, path), false, `${role}: ${path}`);
    }
  }
});
