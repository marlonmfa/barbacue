import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.ERP_TEST_URL || "http://localhost:3098";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Use an isolated local server/database",
);
let cookie = "",
  checks = 0;
async function req(path, method = "GET", body, expected = 200, auth = cookie) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", cookie: auth },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  assert.equal(r.status, expected, JSON.stringify(data).slice(0, 500));
  checks++;
  return { r, data };
}
const call = async (command, expected = 200, requestId = randomUUID()) =>
  (await req("/api/admin/erp", "POST", { requestId, command }, expected)).data;
const suffix = Date.now();
await req("/api/admin/erp", "GET", undefined, 401);
const login = await req("/api/admin/auth", "POST", {
  password: process.env.ERP_TEST_PASSWORD || "erp-test-password",
});
cookie = login.r.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
await req("/admin/erp");
const staff = await req(
  "/api/admin/staff",
  "POST",
  {
    name: "ERP test kitchen",
    username: `erpkitchen${suffix}`,
    password: "erp-test-kitchen-password",
    role: "kitchen",
  },
  201,
);
const kitchen = await req("/api/admin/auth", "POST", {
  username: `erpkitchen${suffix}`,
  password: "erp-test-kitchen-password",
});
const kitchenCookie = kitchen.r.headers
  .getSetCookie()
  .map((v) => v.split(";")[0])
  .join("; ");
await req("/api/admin/erp", "GET", undefined, 403, kitchenCookie);
await req(
  "/api/admin/erp",
  "POST",
  { requestId: randomUUID(), command: { action: "recipe.seed" } },
  403,
  kitchenCookie,
);
const supplier = await call({
  action: "supplier.save",
  name: "Test supplier " + suffix,
});
const ingredient = await call({
  action: "ingredient.save",
  name: "Test flour " + suffix,
  unit: "kg",
  minimumMilli: 1000,
  unitCostCents: 1000,
});
const purchase = await call({
  action: "purchase.save",
  supplierId: supplier.id,
  brand: "barbacue",
  dueDate: "2026-10-01",
  lines: [
    { ingredientId: ingredient.id, quantityMilli: 10000, unitCostCents: 2000 },
  ],
});
const receiveId = randomUUID();
await Promise.all([
  call({ action: "purchase.receive", id: purchase.id }, 200, receiveId),
  call({ action: "purchase.receive", id: purchase.id }, 200, receiveId),
]);
await call({ action: "purchase.receive", id: purchase.id }, 409);
let d = (await req("/api/admin/erp")).data;
assert.equal(
  d.ingredients.find((i) => i.id === ingredient.id).stockMilli,
  10000,
);
checks++;
const f = d.finance.filter((f) => f.sourceKey === `purchase:${purchase.id}`);
assert.equal(f.length, 1);
assert.equal(f[0].amountCents, 20000);
checks += 2;
await call(
  {
    action: "stock.adjust",
    ingredientId: ingredient.id,
    quantityMilli: -10001,
    reason: "Invalid loss",
  },
  409,
);
await call(
  {
    action: "ingredient.save",
    id: ingredient.id,
    name: "Changed",
    unit: "un",
    minimumMilli: 0,
    unitCostCents: 0,
  },
  409,
);
const recipe = await call({
  action: "recipe.save",
  name: "Test recipe " + suffix,
  brand: "barbacue",
  yieldPortions: 2,
  salePriceCents: 2000,
  parts: [{ ingredientId: ingredient.id, quantityMilli: 2000 }],
  status: "ready",
  instructions: "Prepare and cook.",
});
await call({ action: "recipe.produce", id: recipe.id, batches: 2 });
await call({ action: "recipe.produce", id: recipe.id, batches: 4 }, 409);
d = (await req("/api/admin/erp")).data;
assert.equal(
  d.ingredients.find((i) => i.id === ingredient.id).stockMilli,
  6000,
);
checks++;
await call(
  {
    action: "recipe.save",
    name: "Incomplete",
    brand: "barbacue",
    yieldPortions: 1,
    salePriceCents: 1,
    parts: [],
    status: "ready",
  },
  409,
);
const tax = await call({
  action: "finance.save",
  brand: "barbacue",
  kind: "payable",
  category: "tax",
  description: "Test tax",
  amountCents: 23000,
  dueDate: "2026-09-30",
  competence: "2026-09",
  document: "Guide 123",
});
await call(
  {
    action: "finance.settle",
    id: tax.id,
    settledDate: "2099-01-01",
    paymentMethod: "pix",
    receipt: "Receipt",
  },
  409,
);
await call({
  action: "finance.settle",
  id: tax.id,
  settledDate: "2026-09-19",
  paymentMethod: "pix",
  receipt: "Receipt test",
});
await call(
  {
    action: "finance.settle",
    id: tax.id,
    settledDate: "2026-09-19",
    paymentMethod: "pix",
    receipt: "Receipt test",
  },
  409,
);
await call({ action: "finance.cancel", id: tax.id }, 409);
await call(
  {
    action: "finance.save",
    brand: "barbacue",
    kind: "payable",
    category: "tax",
    description: "Missing guide",
    amountCents: 100,
    dueDate: "2026-10-01",
  },
  409,
);
await call(
  {
    action: "finance.save",
    brand: "barbacue",
    kind: "payable",
    category: "operating",
    description: "Invalid date",
    amountCents: 100,
    dueDate: "2026-02-30",
  },
  422,
);
const e = (
  await req(
    "/api/admin/employees",
    "POST",
    {
      name: "Test employee " + suffix,
      jobTitle: "Cook",
      brand: "barbacue",
      employmentType: "clt",
      salaryCents: 200000,
      weeklyHours: 44,
      workSchedule: { days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" },
    },
    201,
  )
).data;
await call({
  action: "payroll.create",
  employeeId: e.id,
  competence: "2026-09",
  additionsCents: 10000,
  deductionsCents: 20000,
  dueDate: "2026-10-05",
});
await call(
  {
    action: "payroll.create",
    employeeId: e.id,
    competence: "2026-09",
    additionsCents: 0,
    deductionsCents: 0,
    dueDate: "2026-10-05",
  },
  409,
);
await call({
  action: "attendance.save",
  employeeId: e.id,
  startAt: "2026-09-18T22:00:00-03:00",
  endAt: "2026-09-19T06:00:00-03:00",
  breakMinutes: 60,
});
await call(
  {
    action: "attendance.save",
    employeeId: e.id,
    startAt: "2026-09-19T00:00:00-03:00",
    endAt: "2026-09-19T07:00:00-03:00",
    breakMinutes: 0,
  },
  409,
);
await call({
  action: "leave.save",
  employeeId: e.id,
  kind: "vacation",
  startDate: "2026-10-01",
  endDate: "2026-10-10",
  status: "approved",
});
await call(
  {
    action: "leave.save",
    employeeId: e.id,
    kind: "medical",
    startDate: "2026-10-05",
    endDate: "2026-10-12",
    status: "planned",
  },
  409,
);
await call({ action: "recipe.seed" });
const before = (await req("/api/admin/erp")).data.recipes;
await call({ action: "recipe.seed" });
d = (await req("/api/admin/erp")).data;
assert.equal(d.recipes.length, before.length);
checks++;
assert.equal(d.payroll.find((p) => p.employeeId === e.id).netCents, 190000);
checks++;
const replayId = randomUUID();
await call(
  {
    action: "stock.adjust",
    ingredientId: ingredient.id,
    quantityMilli: 1000,
    reason: "Test replay",
  },
  200,
  replayId,
);
await call(
  {
    action: "stock.adjust",
    ingredientId: ingredient.id,
    quantityMilli: 2000,
    reason: "Test replay",
  },
  409,
  replayId,
);
console.log(
  `Passed ${checks} ERP checks: authentication, permissions, atomic stock/finance, concurrent retries, recipes, taxes, payroll, attendance, leave and validation.`,
);
