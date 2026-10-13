import { createHash } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  erpSuppliers as suppliers,
  erpIngredients as ingredients,
  erpPurchases as purchases,
  erpRecipes as recipes,
  erpMovements as movements,
  erpFinance as finance,
  erpPayroll as payroll,
  erpAttendance as attendance,
  erpLeaves as leaves,
  erpAudit as audit,
  employees,
  products,
  categories,
  brandCatalogProducts,
  orders,
} from "@/db/schema";
import { erpRequest, lineTotal } from "./erp-validation";
import barbadog from "@/data/barbadog.json";
import chelas from "@/data/chelas.json";
import type { z } from "zod";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class ErpError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ErpError(message);
}
async function activeIngredient(tx: Tx, id: number) {
  const [row] = await tx
    .select()
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .for("update");
  check(row?.active, "Insumo inexistente ou inativo.");
  return row;
}
async function employee(tx: Tx, id: number) {
  const [row] = await tx.select().from(employees).where(eq(employees.id, id));
  check(row?.active, "Funcionário inexistente ou inativo.");
  return row;
}
async function move(
  tx: Tx,
  ingredientId: number,
  quantityMilli: number,
  reason: string,
  reference: string,
  actorId: number,
) {
  const row = await activeIngredient(tx, ingredientId);
  const balance = row.stockMilli + quantityMilli;
  check(
    Number.isSafeInteger(balance) && balance >= 0 && balance <= 2_000_000_000,
    `Saldo insuficiente ou acima do limite para ${row.name}.`,
  );
  await tx
    .update(ingredients)
    .set({ stockMilli: balance })
    .where(eq(ingredients.id, ingredientId));
  await tx
    .insert(movements)
    .values({ ingredientId, quantityMilli, reason, reference, actorId });
}

export async function seedRecipes(tx: Tx) {
  const native = await tx
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.priceCents,
      category: categories.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id));
  const managed = await tx.select().from(brandCatalogProducts);
  const rows = native.map((p) => ({
    catalogKey: `barbacue:${p.id}`,
    brand: "barbacue",
    name: p.name,
    description: p.description || "",
    category: p.category || "",
    salePriceCents: p.price,
  }));
  for (const brand of ["barbadog", "chelas"] as const) {
    const snapshot = brand === "barbadog" ? barbadog : chelas;
    const merged = new Map(
      snapshot.items.map((p) => [
        p.id,
        {
          catalogKey: `${brand}:${p.id}`,
          brand,
          name: p.name,
          description: p.description || "",
          category: p.category,
          salePriceCents: p.priceCents,
        },
      ]),
    );
    for (const p of managed.filter((p) => p.brand === brand))
      merged.set(p.externalId, {
        catalogKey: `${brand}:${p.externalId}`,
        brand,
        name: p.name,
        description: p.description || "",
        category: p.category,
        salePriceCents: p.priceCents,
      });
    rows.push(...merged.values());
  }
  if (!rows.length) return { imported: 0 };
  // Imported descriptions are evidence, not invented technical specifications.
  const inserted = await tx
    .insert(recipes)
    .values(rows)
    .onConflictDoNothing({ target: recipes.catalogKey })
    .returning({ id: recipes.id });
  return { imported: inserted.length };
}

export async function erpSnapshot() {
  const [s, i, p, r, m, f, pay, a, l, e, sales, history] = await Promise.all([
    db.select().from(suppliers).orderBy(suppliers.name),
    db.select().from(ingredients).orderBy(ingredients.name),
    db.select().from(purchases).orderBy(desc(purchases.id)),
    db.select().from(recipes).orderBy(recipes.brand, recipes.name),
    db.select().from(movements).orderBy(desc(movements.id)).limit(200),
    db.select().from(finance).orderBy(finance.dueDate),
    db.select().from(payroll).orderBy(desc(payroll.id)),
    db.select().from(attendance).orderBy(desc(attendance.startAt)).limit(500),
    db.select().from(leaves).orderBy(desc(leaves.startDate)),
    db
      .select({
        id: employees.id,
        name: employees.name,
        brand: employees.brand,
        salaryCents: employees.salaryCents,
        active: employees.active,
      })
      .from(employees),
    db
      .select({
        brand: orders.brand,
        totalCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::bigint`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.paymentStatus, "paid"),
          sql`${orders.status} <> 'cancelled'`,
        ),
      )
      .groupBy(orders.brand),
    db
      .select({
        id: audit.id,
        actorId: audit.actorId,
        action: audit.action,
        createdAt: audit.createdAt,
      })
      .from(audit)
      .orderBy(desc(audit.id))
      .limit(100),
  ]);
  return {
    suppliers: s,
    ingredients: i,
    purchases: p,
    recipes: r,
    movements: m,
    finance: f,
    payroll: pay,
    attendance: a,
    leaves: l,
    employees: e,
    sales,
    audit: history,
  };
}

export async function executeErp(
  input: z.infer<typeof erpRequest>,
  actorId: number,
) {
  return db.transaction(async (tx) => {
    // Serialize mutations, including duplicate retries, stock and HR overlap checks.
    await tx.execute(sql`select pg_advisory_xact_lock(73149206)`);
    const requestHash = createHash("sha256")
      .update(JSON.stringify(input.command))
      .digest("hex");
    const [previous] = await tx
      .select()
      .from(audit)
      .where(eq(audit.requestId, input.requestId));
    if (previous) {
      check(
        previous.actorId === actorId &&
          previous.action === input.command.action &&
          previous.result.requestHash === requestHash,
        "Identificador já utilizado.",
      );
      return previous.result;
    }
    const c = input.command;
    let result: Record<string, unknown> = {};
    switch (c.action) {
      case "supplier.save": {
        const { action, id, ...values } = c;
        void action;
        const [row] = id
          ? await tx
              .update(suppliers)
              .set(values)
              .where(eq(suppliers.id, id))
              .returning()
          : await tx.insert(suppliers).values(values).returning();
        check(row, "Fornecedor não encontrado.");
        result = { id: row.id };
        break;
      }
      case "ingredient.save": {
        const { action, id, ...values } = c;
        void action;
        if (id) {
          const [old] = await tx
            .select()
            .from(ingredients)
            .where(eq(ingredients.id, id));
          check(old, "Insumo não encontrado.");
          check(
            old.unit === values.unit,
            "A unidade de um insumo cadastrado não pode ser alterada. Cadastre outro insumo.",
          );
        }
        const [row] = id
          ? await tx
              .update(ingredients)
              .set(values)
              .where(eq(ingredients.id, id))
              .returning()
          : await tx.insert(ingredients).values(values).returning();
        result = { id: row.id };
        break;
      }
      case "stock.adjust":
        await move(
          tx,
          c.ingredientId,
          c.quantityMilli,
          c.reason,
          input.requestId,
          actorId,
        );
        break;
      case "purchase.save": {
        const { action, id, ...values } = c;
        void action;
        const [supplier] = await tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, c.supplierId));
        check(supplier?.active, "Selecione um fornecedor ativo.");
        for (const l of c.lines) await activeIngredient(tx, l.ingredientId);
        const totalCents = lineTotal(c.lines);
        check(totalCents > 0, "A compra deve ter valor maior que zero.");
        const [row] = id
          ? await tx
              .update(purchases)
              .set({ ...values, totalCents })
              .where(and(eq(purchases.id, id), eq(purchases.status, "draft")))
              .returning()
          : await tx
              .insert(purchases)
              .values({ ...values, totalCents })
              .returning();
        check(row, "Somente compras em rascunho podem ser editadas.");
        result = { id: row.id };
        break;
      }
      case "purchase.receive": {
        const [p] = await tx
          .select()
          .from(purchases)
          .where(eq(purchases.id, c.id))
          .for("update");
        check(
          p && p.status === "draft",
          "Compra já recebida, cancelada ou inexistente.",
        );
        for (const l of p.lines) {
          const old = await activeIngredient(tx, l.ingredientId);
          const unitCostCents = Math.round(
            (old.stockMilli * old.unitCostCents +
              l.quantityMilli * l.unitCostCents) /
              (old.stockMilli + l.quantityMilli),
          );
          await move(
            tx,
            l.ingredientId,
            l.quantityMilli,
            "Recebimento de compra",
            `purchase:${p.id}`,
            actorId,
          );
          await tx
            .update(ingredients)
            .set({ unitCostCents })
            .where(eq(ingredients.id, l.ingredientId));
        }
        await tx.insert(finance).values({
          brand: p.brand,
          kind: "payable",
          category: "purchase",
          description: `Compra #${p.id}`,
          amountCents: p.totalCents,
          dueDate: p.dueDate,
          document: p.invoice,
          sourceKey: `purchase:${p.id}`,
        });
        await tx
          .update(purchases)
          .set({ status: "received", receivedAt: new Date() })
          .where(eq(purchases.id, p.id));
        break;
      }
      case "purchase.cancel": {
        const rows = await tx
          .update(purchases)
          .set({ status: "cancelled" })
          .where(and(eq(purchases.id, c.id), eq(purchases.status, "draft")))
          .returning();
        check(rows.length, "Só é possível cancelar compras em rascunho.");
        break;
      }
      case "recipe.seed":
        result = await seedRecipes(tx);
        break;
      case "recipe.save": {
        const { action, id, ...values } = c;
        void action;
        for (const part of c.parts)
          await activeIngredient(tx, part.ingredientId);
        check(
          c.status !== "ready" ||
            (c.parts.length > 0 && c.instructions.length > 0),
          "Informe os insumos, quantidades e o modo de preparo para aprovar a ficha.",
        );
        const [row] = id
          ? await tx
              .update(recipes)
              .set({ ...values, updatedAt: new Date() })
              .where(eq(recipes.id, id))
              .returning()
          : await tx.insert(recipes).values(values).returning();
        check(row, "Receita não encontrada.");
        result = { id: row.id };
        break;
      }
      case "recipe.produce": {
        const [r] = await tx.select().from(recipes).where(eq(recipes.id, c.id));
        check(
          r?.status === "ready" && r.parts.length,
          "Revise e aprove a ficha técnica antes de produzir.",
        );
        for (const p of r.parts)
          await move(
            tx,
            p.ingredientId,
            -p.quantityMilli * c.batches,
            `Produção: ${r.name} (${c.batches} lote(s))`,
            input.requestId,
            actorId,
          );
        result = { portions: r.yieldPortions * c.batches };
        break;
      }
      case "finance.save": {
        const { action, id, ...values } = c;
        void action;
        check(
          c.category !== "tax" ||
            (c.kind === "payable" && c.competence && c.document),
          "Informe competência e referência da guia do imposto.",
        );
        const [row] = id
          ? await tx
              .update(finance)
              .set({ ...values, competence: values.competence ?? null })
              .where(
                and(
                  eq(finance.id, id),
                  eq(finance.status, "open"),
                  sql`${finance.sourceKey} is null`,
                ),
              )
              .returning()
          : await tx.insert(finance).values(values).returning();
        check(row, "Só é possível editar lançamentos manuais em aberto.");
        result = { id: row.id };
        break;
      }
      case "finance.settle": {
        const today = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
        }).format(new Date());
        check(
          c.settledDate <= today,
          "A data de pagamento não pode ser futura.",
        );
        const rows = await tx
          .update(finance)
          .set({
            status: "settled",
            settledDate: c.settledDate,
            paymentMethod: c.paymentMethod,
            receipt: c.receipt,
          })
          .where(and(eq(finance.id, c.id), eq(finance.status, "open")))
          .returning();
        check(rows.length, "Lançamento já baixado, cancelado ou inexistente.");
        break;
      }
      case "finance.cancel": {
        const rows = await tx
          .update(finance)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(finance.id, c.id),
              eq(finance.status, "open"),
              sql`${finance.sourceKey} is null`,
            ),
          )
          .returning();
        check(
          rows.length,
          "Só é possível cancelar lançamentos manuais em aberto.",
        );
        break;
      }
      case "payroll.create": {
        const e = await employee(tx, c.employeeId);
        const netCents = e.salaryCents + c.additionsCents - c.deductionsCents;
        check(
          netCents > 0 && netCents <= 100_000_000,
          "O líquido deve ser positivo e estar dentro do limite.",
        );
        const [existing] = await tx
          .select()
          .from(payroll)
          .where(
            and(
              eq(payroll.employeeId, e.id),
              eq(payroll.competence, c.competence),
            ),
          );
        check(
          !existing,
          "Folha já lançada para esse funcionário e competência.",
        );
        const [f] = await tx
          .insert(finance)
          .values({
            brand: e.brand,
            kind: "payable",
            category: "payroll",
            description: `Folha ${c.competence}: ${e.name}`,
            amountCents: netCents,
            dueDate: c.dueDate,
            competence: c.competence,
            sourceKey: `payroll:${e.id}:${c.competence}`,
          })
          .returning();
        const [row] = await tx
          .insert(payroll)
          .values({
            employeeId: e.id,
            competence: c.competence,
            baseCents: e.salaryCents,
            additionsCents: c.additionsCents,
            deductionsCents: c.deductionsCents,
            netCents,
            notes: c.notes,
            financeId: f.id,
          })
          .returning();
        result = { id: row.id };
        break;
      }
      case "attendance.save": {
        await employee(tx, c.employeeId);
        const startAt = new Date(c.startAt),
          endAt = new Date(c.endAt),
          minutes = (endAt.getTime() - startAt.getTime()) / 60000;
        check(
          minutes > 0 && minutes <= 1440 && c.breakMinutes < minutes,
          "Informe um turno de até 24 horas com intervalo menor que a duração.",
        );
        const overlap = await tx
          .select()
          .from(attendance)
          .where(
            and(
              eq(attendance.employeeId, c.employeeId),
              sql`${attendance.startAt} < ${endAt} and ${attendance.endAt} > ${startAt}`,
              c.id ? sql`${attendance.id} <> ${c.id}` : sql`true`,
            ),
          );
        check(!overlap.length, "Já existe ponto nesse período.");
        const values = {
          employeeId: c.employeeId,
          startAt,
          endAt,
          breakMinutes: c.breakMinutes,
          notes: c.notes,
        };
        const [row] = c.id
          ? await tx
              .update(attendance)
              .set(values)
              .where(eq(attendance.id, c.id))
              .returning()
          : await tx.insert(attendance).values(values).returning();
        check(row, "Ponto não encontrado.");
        result = { id: row.id };
        break;
      }
      case "leave.save": {
        await employee(tx, c.employeeId);
        check(
          c.endDate >= c.startDate,
          "O fim deve ser igual ou posterior ao início.",
        );
        if (c.status !== "cancelled") {
          const overlap = await tx
            .select()
            .from(leaves)
            .where(
              and(
                eq(leaves.employeeId, c.employeeId),
                sql`${leaves.status} <> 'cancelled' and ${leaves.startDate} <= ${c.endDate} and ${leaves.endDate} >= ${c.startDate}`,
                c.id ? sql`${leaves.id} <> ${c.id}` : sql`true`,
              ),
            );
          check(!overlap.length, "Já existe afastamento nesse período.");
        }
        const { action, id, ...values } = c;
        void action;
        const [row] = id
          ? await tx
              .update(leaves)
              .set(values)
              .where(eq(leaves.id, id))
              .returning()
          : await tx.insert(leaves).values(values).returning();
        check(row, "Afastamento não encontrado.");
        result = { id: row.id };
        break;
      }
    }
    await tx.insert(audit).values({
      requestId: input.requestId,
      actorId,
      action: c.action,
      result: { ...result, command: c, requestHash },
    });
    return result;
  });
}
