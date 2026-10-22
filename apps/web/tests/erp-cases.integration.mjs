import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import pg from "pg";
const base = process.env.ERP_TEST_URL,
  database = process.env.DATABASE_URL;
assert(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert(
  database &&
    ["localhost", "127.0.0.1"].includes(new URL(database).hostname) &&
    new URL(database).pathname.includes("test"),
);
const pool = new pg.Pool({ connectionString: database });
const prefix = `ERP matrix ${Date.now()}`,
  report = [];
const payload = `0|admin|${Date.now() + 600000}`;
const cookie = `barbacue_admin=${payload}.${createHmac("sha256", process.env.ADMIN_COOKIE_SECRET).update(payload).digest("base64url")}`;
let checks = 0;
async function command(c, status = 200, key = randomUUID(), auth = cookie) {
  const r = await fetch(base + "/api/admin/erp", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: auth },
    body: JSON.stringify({ requestId: key, command: c }),
  });
  const b = await r.json();
  assert.equal(r.status, status, `${c.action}: ${JSON.stringify(b)}`);
  checks++;
  return b;
}
async function snapshot() {
  const r = await fetch(base + "/api/admin/erp", { headers: { cookie } });
  assert.equal(r.status, 200);
  checks++;
  return r.json();
}
const check = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
async function scenario(name, fn) {
  await fn();
  report.push(name);
  console.log("PASS " + name);
}
let supplier, ingredient, second, purchase, recipe, emp;
const future = "2026-12-01";
try {
  await scenario(
    "all staff roles denied, forged session and malformed command",
    async () => {
      await command(
        { action: "recipe.seed" },
        401,
        randomUUID(),
        "barbacue_admin=forged",
      );
      await command({ action: "unknown" }, 422);
      await command({ action: "recipe.seed" }, 422, "invalid");
      for (const role of [
        "manager",
        "cashier",
        "kitchen",
        "waiter",
        "driver",
        "employee",
      ]) {
        const s = (
          await pool.query(
            "INSERT INTO staff_users(name,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id",
            [prefix, prefix + role, "no-password", role],
          )
        ).rows[0];
        const v = `${s.id}|${role}|${Date.now() + 600000}`,
          t = `barbacue_admin=${v}.${createHmac("sha256", process.env.ADMIN_COOKIE_SECRET).update(v).digest("base64url")}`;
        await command({ action: "recipe.seed" }, 403, randomUUID(), t);
        const r = await fetch(base + "/api/admin/erp", {
          headers: { cookie: t },
        });
        check(r.status, 403);
      }
    },
  );
  await scenario("supplier create, edit, inactivate, missing ID", async () => {
    supplier = await command({
      action: "supplier.save",
      name: prefix,
      document: "123",
      contact: "test@example.test",
    });
    await command({
      action: "supplier.save",
      id: supplier.id,
      name: prefix + " edited",
      active: false,
    });
    await command(
      { action: "supplier.save", id: 2147483647, name: "Not found" },
      409,
    );
    check(
      (await snapshot()).suppliers.find((s) => s.id === supplier.id).active,
      false,
    );
  });
  await scenario(
    "ingredient create/edit, nonnegative fields and fixed unit",
    async () => {
      ingredient = await command({
        action: "ingredient.save",
        name: prefix,
        unit: "kg",
        minimumMilli: 1000,
        unitCostCents: 100,
      });
      second = await command({
        action: "ingredient.save",
        name: prefix + " second",
        unit: "un",
        minimumMilli: 0,
        unitCostCents: 200,
      });
      await command({
        action: "ingredient.save",
        id: ingredient.id,
        name: prefix,
        unit: "kg",
        minimumMilli: 2000,
        unitCostCents: 200,
      });
      await command(
        {
          action: "ingredient.save",
          id: 2147483647,
          name: "Missing",
          unit: "kg",
          minimumMilli: 0,
          unitCostCents: 1,
        },
        409,
      );
      await command(
        {
          action: "ingredient.save",
          name: "Negative",
          unit: "kg",
          minimumMilli: -1,
          unitCostCents: 1,
        },
        422,
      );
      await command(
        {
          action: "stock.adjust",
          ingredientId: ingredient.id,
          quantityMilli: 0,
          reason: "Zero",
        },
        422,
      );
      await command({
        action: "stock.adjust",
        ingredientId: ingredient.id,
        quantityMilli: 1000,
        reason: "Opening",
      });
      await command({
        action: "stock.adjust",
        ingredientId: ingredient.id,
        quantityMilli: -500,
        reason: "Loss",
      });
      check(
        (await snapshot()).ingredients.find((i) => i.id === ingredient.id)
          .stockMilli,
        500,
      );
    },
  );
  await scenario(
    "purchase draft editing/cancellation and input validation",
    async () => {
      const c = {
        action: "purchase.save",
        supplierId: supplier.id,
        brand: "barbacue",
        dueDate: future,
        lines: [
          {
            ingredientId: ingredient.id,
            quantityMilli: 1000,
            unitCostCents: 300,
          },
        ],
      };
      await command(c, 409);
      await command({
        action: "supplier.save",
        id: supplier.id,
        name: prefix,
        active: true,
      });
      await command({ ...c, lines: [] }, 422);
      await command({ ...c, lines: [c.lines[0], c.lines[0]] }, 422);
      await command(
        {
          ...c,
          lines: [
            {
              ...c.lines[0],
              quantityMilli: 100000000,
              unitCostCents: 100000000,
            },
          ],
        },
        422,
      );
      purchase = await command(c);
      await command({
        ...c,
        id: purchase.id,
        invoice: "NF 123",
        lines: [{ ...c.lines[0], quantityMilli: 2000 }],
      });
      check(
        (await snapshot()).purchases.find((p) => p.id === purchase.id)
          .totalCents,
        600,
      );
      const cancelled = await command(c);
      await command({ action: "purchase.cancel", id: cancelled.id });
      await command({ action: "purchase.receive", id: cancelled.id }, 409);
      await command({ ...c, id: cancelled.id }, 409);
      await command({ action: "purchase.cancel", id: 2147483647 }, 409);
    },
  );
  await scenario(
    "receiving is atomic; weighted average and linked bills protected",
    async () => {
      await command({ action: "purchase.receive", id: purchase.id });
      const d = await snapshot(),
        i = d.ingredients.find((i) => i.id === ingredient.id),
        f = d.finance.find((f) => f.sourceKey === `purchase:${purchase.id}`);
      check(i.stockMilli, 2500);
      check(i.unitCostCents, 280);
      check(f.amountCents, 600);
      await command({ action: "finance.cancel", id: f.id }, 409);
      await command(
        {
          action: "finance.save",
          id: f.id,
          brand: "barbacue",
          kind: "payable",
          category: "other",
          description: "Tamper",
          amountCents: 1,
          dueDate: future,
        },
        409,
      );
      await command({ action: "purchase.cancel", id: purchase.id }, 409);
      const multi = await command({
        action: "purchase.save",
        supplierId: supplier.id,
        brand: "chelas",
        dueDate: future,
        lines: [
          {
            ingredientId: ingredient.id,
            quantityMilli: 1000,
            unitCostCents: 100,
          },
          { ingredientId: second.id, quantityMilli: 1000, unitCostCents: 100 },
        ],
      });
      await command({
        action: "ingredient.save",
        id: second.id,
        name: prefix + " second",
        unit: "un",
        minimumMilli: 0,
        unitCostCents: 200,
        active: false,
      });
      await command({ action: "purchase.receive", id: multi.id }, 409);
      const after = await snapshot();
      check(
        after.ingredients.find((i) => i.id === ingredient.id).stockMilli,
        2500,
      );
      check(
        after.finance.some((f) => f.sourceKey === `purchase:${multi.id}`),
        false,
      );
      check(after.purchases.find((p) => p.id === multi.id).status, "draft");
      await command({
        action: "ingredient.save",
        id: second.id,
        name: prefix + " second",
        unit: "un",
        minimumMilli: 0,
        unitCostCents: 200,
        active: true,
      });
    },
  );
  await scenario(
    "recipes approve/edit, consumption rollback, seed preserves edits",
    async () => {
      const c = {
        action: "recipe.save",
        name: prefix,
        brand: "barbadog",
        yieldPortions: 2,
        salePriceCents: 1000,
        instructions: "Confirmed recipe",
        status: "ready",
        parts: [
          { ingredientId: ingredient.id, quantityMilli: 1000 },
          { ingredientId: second.id, quantityMilli: 1000 },
        ],
      };
      recipe = await command(c);
      await command(
        { action: "recipe.produce", id: recipe.id, batches: 1 },
        409,
      );
      check(
        (await snapshot()).ingredients.find((i) => i.id === ingredient.id)
          .stockMilli,
        2500,
      );
      await command({
        action: "stock.adjust",
        ingredientId: second.id,
        quantityMilli: 1000,
        reason: "Opening",
      });
      check(
        (await command({ action: "recipe.produce", id: recipe.id, batches: 1 }))
          .portions,
        2,
      );
      await command({ ...c, id: recipe.id, status: "review" });
      await command(
        { action: "recipe.produce", id: recipe.id, batches: 1 },
        409,
      );
      await command({ ...c, id: 2147483647 }, 409);
      await command({ ...c, yieldPortions: 0 }, 422);
      const s = (await snapshot()).recipes.find((r) => r.catalogKey);
      await command({
        ...s,
        action: "recipe.save",
        instructions: "Preserved reviewed instructions",
      });
      await command({ action: "recipe.seed" });
      await command({ action: "recipe.seed" });
      check(
        (await snapshot()).recipes.find((r) => r.id === s.id).instructions,
        "Preserved reviewed instructions",
      );
    },
  );
  await scenario(
    "receivables, payable edit/cancel/settlement and tax metadata",
    async () => {
      const c = {
        action: "finance.save",
        brand: "chelas",
        kind: "receivable",
        category: "other",
        description: prefix,
        amountCents: 2000,
        dueDate: future,
        competence: "2026-09",
      };
      const f = await command(c);
      await command({
        ...c,
        id: f.id,
        amountCents: 3000,
        competence: undefined,
      });
      const saved = (await snapshot()).finance.find((r) => r.id === f.id);
      check(saved.amountCents, 3000);
      check(saved.competence, null);
      await command({
        action: "finance.settle",
        id: f.id,
        settledDate: "2026-09-01",
        paymentMethod: "cash",
        receipt: "Received receipt",
      });
      await command({ ...c, id: f.id }, 409);
      const cancel = await command({ ...c, kind: "payable" });
      await command({ action: "finance.cancel", id: cancel.id });
      await command(
        {
          action: "finance.settle",
          id: cancel.id,
          settledDate: "2026-09-01",
          paymentMethod: "pix",
          receipt: "No",
        },
        422,
      );
      await command({ ...c, category: "tax" }, 409);
      await command(
        { ...c, kind: "payable", category: "tax", document: "   " },
        409,
      );
      await command({ ...c, amountCents: -1 }, 422);
      await command(
        {
          action: "finance.settle",
          id: 2147483647,
          settledDate: "2026-09-01",
          paymentMethod: "cash",
          receipt: "Valid",
        },
        409,
      );
    },
  );
  await scenario(
    "payroll concurrent uniqueness, invalid liquid and inactive employee",
    async () => {
      emp = (
        await pool.query(
          "INSERT INTO employees(name,job_title,salary_cents,brand) VALUES($1,'Cook',100000,'chelas') RETURNING id",
          [prefix],
        )
      ).rows[0];
      const c = {
        action: "payroll.create",
        employeeId: emp.id,
        competence: "2026-10",
        additionsCents: 10000,
        deductionsCents: 5000,
        dueDate: future,
      };
      const requests = await Promise.all([
        fetch(base + "/api/admin/erp", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ requestId: randomUUID(), command: c }),
        }),
        fetch(base + "/api/admin/erp", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ requestId: randomUUID(), command: c }),
        }),
      ]);
      check(requests.map((r) => r.status).sort(), [200, 409]);
      const d = await snapshot(),
        p = d.payroll.find((p) => p.employeeId === emp.id);
      check(p.netCents, 105000);
      check(d.finance.find((f) => f.id === p.financeId).brand, "chelas");
      await command(
        { ...c, competence: "2026-11", deductionsCents: 200000 },
        409,
      );
      await pool.query("UPDATE employees SET active=false WHERE id=$1", [
        emp.id,
      ]);
      await command({ ...c, competence: "2026-11" }, 409);
      await pool.query("UPDATE employees SET active=true WHERE id=$1", [
        emp.id,
      ]);
    },
  );
  await scenario(
    "attendance correction, overnight/boundary/invalid shifts",
    async () => {
      const c = {
        action: "attendance.save",
        employeeId: emp.id,
        startAt: "2026-09-10T22:00:00-03:00",
        endAt: "2026-09-11T06:00:00-03:00",
        breakMinutes: 60,
      };
      const a = await command(c);
      await command({ ...c, id: a.id, breakMinutes: 30 });
      check(
        (await snapshot()).attendance.find((r) => r.id === a.id).breakMinutes,
        30,
      );
      await command({
        ...c,
        startAt: c.endAt,
        endAt: "2026-09-11T07:00:00-03:00",
        breakMinutes: 0,
      });
      await command({ ...c, endAt: c.startAt }, 409);
      await command({ ...c, breakMinutes: 600 }, 409);
      await command({ ...c, endAt: "2026-09-12T06:00:00-03:00" }, 409);
      await command(
        {
          ...c,
          id: 2147483647,
          startAt: "2026-09-01T01:00:00Z",
          endAt: "2026-09-01T03:00:00Z",
        },
        409,
      );
    },
  );
  await scenario(
    "leave approval/edit/cancel, reuse cancelled period and invalid dates",
    async () => {
      const c = {
        action: "leave.save",
        employeeId: emp.id,
        kind: "vacation",
        status: "planned",
        startDate: "2026-12-01",
        endDate: "2026-12-10",
      };
      const l = await command(c);
      await command({ ...c, id: l.id, status: "approved" });
      await command({ ...c, id: l.id, status: "cancelled" });
      await command({ ...c, kind: "medical" });
      await command({ ...c, startDate: "2026-12-11", endDate: "2026-12-12" });
      await command(
        { ...c, startDate: "2026-12-12", endDate: "2026-12-01" },
        409,
      );
      await command({ ...c, id: 2147483647, status: "cancelled" }, 409);
    },
  );
  await scenario(
    "audit captures successful changes only and request-ID conflicts rejected",
    async () => {
      const key = randomUUID(),
        c = {
          action: "stock.adjust",
          ingredientId: ingredient.id,
          quantityMilli: 1000,
          reason: "Idempotent matrix",
        };
      const n = (await pool.query("SELECT count(*)::int n FROM erp_audit"))
        .rows[0].n;
      await command(c, 200, key);
      await command(c, 200, key);
      await command({ ...c, quantityMilli: 2000 }, 409, key);
      check(
        (await pool.query("SELECT count(*)::int n FROM erp_audit")).rows[0].n,
        n + 1,
      );
    },
  );
  console.log(JSON.stringify({ checks, scenarios: report }, null, 2));
} finally {
  await pool.end();
}
