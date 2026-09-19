import { withStaff } from '@/lib/admin-auth';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { importBatchSchema, importedOrderId } from '@/lib/imported-orders';

export const runtime = 'nodejs';
export const POST = withStaff(async request => {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Envie um arquivo JSON.' }, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Arquivo vazio.' }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256000) { await reader.cancel(); return Response.json({ error: 'O arquivo deve ter até 256 KB.' }, { status: 413 }); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return Response.json({ error: 'O arquivo não é um JSON válido.' }, { status: 400 }); }
  const parsed = importBatchSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json({ error: `Confira ${issue.path.join('.')}: ${issue.message}` }, { status: 422 });
  }
  const result = await db.transaction(async tx => {
    let imported = 0;
    for (const input of parsed.data.orders) {
      const subtotalCents = input.items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
      const rows = await tx.insert(orders).values({
        id: importedOrderId(input.source, input.externalId, input.brand), brand: input.brand,
        customerName: input.customerName, customerPhone: input.customerPhone,
        orderType: input.orderType, deliveryAddress: input.deliveryAddress || null,
        items: input.items, subtotalCents, discountCents: input.discountCents,
        deliveryFeeCents: input.deliveryFeeCents, totalCents: subtotalCents - input.discountCents + input.deliveryFeeCents,
        channel: input.source, status: 'pending', paymentMethod: input.paymentMethod, paymentStatus: input.paymentStatus,
        notes: [`Origem: ${input.source} / ${input.externalId}`, input.notes].filter(Boolean).join('\n'),
      }).onConflictDoNothing({ target: orders.id }).returning({ id: orders.id });
      imported += rows.length;
    }
    return { imported, skipped: parsed.data.orders.length - imported };
  });
  return Response.json(result);
});
