/** Discounts apply to food only. Freight is then added to the payable total. */
export function orderTotalCents(subtotalCents: number, discountCents: number, deliveryFeeCents = 0): number {
  for (const value of [subtotalCents, discountCents, deliveryFeeCents]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Valores inválidos para o pedido.");
  }
  const total = Math.max(0, subtotalCents - discountCents) + deliveryFeeCents;
  if (total > 2_147_483_647) throw new RangeError("Valor do pedido acima do limite.");
  return total;
}
