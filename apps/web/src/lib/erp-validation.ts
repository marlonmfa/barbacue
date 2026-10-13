import { z } from "zod";
const id = z.number().int().positive().max(2_147_483_647);
const amount = z.number().int().min(0).max(100_000_000);
const quantity = z.number().int().positive().max(100_000_000);
const date = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const brand = z.enum(["barbacue", "barbadog", "chelas"]);
const name = z.string().trim().min(2).max(200);
const notes = z.string().trim().max(4000).default("");
const part = z.object({ ingredientId: id, quantityMilli: quantity });
const line = part.extend({ unitCostCents: amount });
const parts = z
  .array(part)
  .max(100)
  .refine(
    (a) => new Set(a.map((v) => v.ingredientId)).size === a.length,
    "Não repita o mesmo insumo.",
  );
export const erpCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("supplier.save"),
    id: id.optional(),
    name,
    document: z.string().max(30).default(""),
    contact: z.string().max(200).default(""),
    notes,
    active: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("ingredient.save"),
    id: id.optional(),
    name,
    unit: z.enum(["kg", "l", "un"]),
    minimumMilli: amount,
    unitCostCents: amount,
    active: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("stock.adjust"),
    ingredientId: id,
    quantityMilli: z
      .number()
      .int()
      .min(-100_000_000)
      .max(100_000_000)
      .refine((v) => v !== 0),
    reason: name,
  }),
  z.object({
    action: z.literal("purchase.save"),
    id: id.optional(),
    supplierId: id,
    brand,
    dueDate: date,
    invoice: z.string().max(200).default(""),
    lines: z
      .array(line)
      .min(1)
      .max(100)
      .refine(
        (a) => new Set(a.map((v) => v.ingredientId)).size === a.length,
        "Não repita o mesmo insumo.",
      )
      .refine(
        (lines) =>
          lines.reduce(
            (total, line) =>
              total +
              Math.round((line.quantityMilli * line.unitCostCents) / 1000),
            0,
          ) <= 100_000_000,
        "Valor total acima do limite permitido.",
      ),
  }),
  z.object({ action: z.literal("purchase.receive"), id }),
  z.object({ action: z.literal("purchase.cancel"), id }),
  z.object({
    action: z.literal("recipe.save"),
    id: id.optional(),
    name,
    brand,
    description: notes,
    category: z.string().max(200).default(""),
    salePriceCents: amount,
    yieldPortions: z.number().int().min(1).max(10000),
    instructions: notes,
    parts,
    status: z.enum(["review", "ready"]),
  }),
  z.object({ action: z.literal("recipe.seed") }),
  z.object({
    action: z.literal("recipe.produce"),
    id,
    batches: z.number().int().min(1).max(1000),
  }),
  z.object({
    action: z.literal("finance.save"),
    id: id.optional(),
    brand,
    kind: z.enum(["payable", "receivable"]),
    category: z.enum(["operating", "tax", "other"]),
    description: name,
    amountCents: amount.refine((v) => v > 0),
    dueDate: date,
    competence: month.optional(),
    document: z.string().trim().max(2000).default(""),
  }),
  z.object({
    action: z.literal("finance.settle"),
    id,
    settledDate: date,
    paymentMethod: z.enum(["pix", "boleto", "transfer", "cash", "card"]),
    receipt: z.string().trim().min(3).max(2000),
  }),
  z.object({ action: z.literal("finance.cancel"), id }),
  z.object({
    action: z.literal("payroll.create"),
    employeeId: id,
    competence: month,
    additionsCents: amount,
    deductionsCents: amount,
    dueDate: date,
    notes,
  }),
  z.object({
    action: z.literal("attendance.save"),
    id: id.optional(),
    employeeId: id,
    startAt: z.iso.datetime({ offset: true }),
    endAt: z.iso.datetime({ offset: true }),
    breakMinutes: z.number().int().min(0).max(1440),
    notes,
  }),
  z.object({
    action: z.literal("leave.save"),
    id: id.optional(),
    employeeId: id,
    kind: z.enum(["vacation", "medical", "absence", "other"]),
    startDate: date,
    endDate: date,
    notes,
    status: z.enum(["planned", "approved", "cancelled"]),
  }),
]);
export const erpRequest = z.object({
  requestId: z.uuid(),
  command: erpCommand,
});
export function lineTotal(
  lines: { quantityMilli: number; unitCostCents: number }[],
) {
  const total = lines.reduce(
    (s, l) => s + Math.round((l.quantityMilli * l.unitCostCents) / 1000),
    0,
  );
  if (!Number.isSafeInteger(total) || total > 100_000_000)
    throw new Error("Valor total acima do limite permitido.");
  return total;
}
