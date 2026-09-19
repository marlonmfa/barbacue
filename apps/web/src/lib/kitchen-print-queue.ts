import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { kitchenPrintAgentState, kitchenPrintJobs, orders } from "@/db/schema";
import { printAgentConfigured, printFailureStatus, printRetryDelaySeconds, PRINT_LEASE_SECONDS, type KitchenTicket } from "@/lib/kitchen-print";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function expireLeases(tx: Transaction) {
  await tx.update(kitchenPrintJobs).set({ status: "uncertain", updatedAt: new Date(), lastError: "O agente perdeu a confirmação. Confira o papel antes de reenviar: pode já ter sido impresso." })
    .where(and(eq(kitchenPrintJobs.status, "printing"), lte(kitchenPrintJobs.leaseExpiresAt, new Date())));
}

export async function claimKitchenPrintJob() {
  return db.transaction(async tx => {
    const now = new Date();
    await tx.insert(kitchenPrintAgentState).values({ id: 1, lastSeenAt: now })
      .onConflictDoUpdate({ target: kitchenPrintAgentState.id, set: { lastSeenAt: now } });
    await expireLeases(tx);
    // Cancellation can happen before the local agent picks up a queued ticket.
    await tx.execute(sql`UPDATE kitchen_print_jobs j SET status = 'failed', last_error = 'Pedido cancelado; não imprimir.', updated_at = now()
      FROM orders o WHERE j.order_id = o.id AND j.status = 'queued' AND o.status = 'cancelled'`);
    const result = await tx.execute<{ id: string }>(sql`
      SELECT j.id FROM kitchen_print_jobs j JOIN orders o ON o.id = j.order_id
      WHERE j.status = 'queued' AND j.next_attempt_at <= now() AND o.status <> 'cancelled'
      ORDER BY j.created_at ASC LIMIT 1 FOR UPDATE OF j SKIP LOCKED`);
    const selected = result.rows[0];
    if (!selected) return null;
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + PRINT_LEASE_SECONDS * 1000);
    const [job] = await tx.update(kitchenPrintJobs).set({ status: "printing", leaseToken, leaseExpiresAt, updatedAt: now, attempts: sql`${kitchenPrintJobs.attempts} + 1` })
      .where(eq(kitchenPrintJobs.id, selected.id)).returning();
    return { id: job.id, leaseToken, leaseExpiresAt: leaseExpiresAt.toISOString(), ticket: job.ticket };
  });
}

export async function completeKitchenPrintJob(id: string, leaseToken: string): Promise<boolean> {
  return db.transaction(async tx => {
    const [job] = await tx.select().from(kitchenPrintJobs).where(eq(kitchenPrintJobs.id, id)).for("update");
    if (!job || job.leaseToken !== leaseToken) return false;
    if (job.status === "printed") return true; // Lost acknowledgement is safe to resend.
    // A durable local receipt can arrive after its lease expired. It may close
    // the uncertain job, but cannot close a manually retried job (new token).
    if (job.status !== "printing" && job.status !== "uncertain") return false;
    await tx.update(kitchenPrintJobs).set({ status: "printed", printedAt: new Date(), updatedAt: new Date(), lastError: null, leaseExpiresAt: null })
      .where(eq(kitchenPrintJobs.id, id));
    return true;
  });
}

export async function failKitchenPrintJob(id: string, leaseToken: string, error: string, uncertain: boolean): Promise<boolean> {
  return db.transaction(async tx => {
    const [job] = await tx.select().from(kitchenPrintJobs).where(eq(kitchenPrintJobs.id, id)).for("update");
    if (!job || job.leaseToken !== leaseToken) return false;
    if (["uncertain", "queued", "failed"].includes(job.status)) return true;
    if (job.status !== "printing") return false;
    const now = new Date();
    await tx.update(kitchenPrintJobs).set({
      status: printFailureStatus(job.attempts, uncertain || !job.leaseExpiresAt || job.leaseExpiresAt <= now), lastError: error,
      leaseExpiresAt: null, updatedAt: now,
      nextAttemptAt: new Date(now.getTime() + printRetryDelaySeconds(job.attempts) * 1000),
    }).where(eq(kitchenPrintJobs.id, id));
    return true;
  });
}

export async function kitchenPrintingOverview() {
  return db.transaction(async tx => {
    await expireLeases(tx);
    const [agent] = await tx.select().from(kitchenPrintAgentState).where(eq(kitchenPrintAgentState.id, 1));
    const pending = await tx.select().from(kitchenPrintJobs).where(ne(kitchenPrintJobs.status, "printed")).orderBy(asc(kitchenPrintJobs.createdAt)).limit(100);
    const recent = await tx.select().from(kitchenPrintJobs).where(eq(kitchenPrintJobs.status, "printed")).orderBy(desc(kitchenPrintJobs.printedAt)).limit(20);
    const [counts] = await tx.select({ totalPending: sql<number>`count(*)::integer` }).from(kitchenPrintJobs).where(ne(kitchenPrintJobs.status, "printed"));
    const jobs = [...pending, ...recent];
    return {
      configured: printAgentConfigured(process.env.PRINT_AGENT_TOKEN),
      lastSeenAt: agent?.lastSeenAt.toISOString() ?? null,
      online: Boolean(agent && Date.now() - agent.lastSeenAt.getTime() < 60_000),
      totalPending: counts.totalPending,
      jobs: jobs.map(job => ({
        id: job.id, orderId: job.orderId, status: job.status, attempts: job.attempts,
        lastError: job.lastError, createdAt: job.createdAt, printedAt: job.printedAt,
        tableNumber: job.ticket.tableNumber, channel: job.ticket.channel, orderNumber: job.ticket.orderNumber,
      })),
    };
  });
}

/** Manual retry deliberately invalidates the old lease and flags the paper. */
export async function retryKitchenPrintJob(id: string): Promise<boolean> {
  return db.transaction(async tx => {
    await expireLeases(tx);
    const [job] = await tx.select().from(kitchenPrintJobs)
      .where(and(eq(kitchenPrintJobs.id, id), inArray(kitchenPrintJobs.status, ["failed", "uncertain"]))).for("update");
    if (!job) return false;
    const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, job.orderId)).for("share");
    if (!order || order.status === "cancelled") return false;
    const ticket: KitchenTicket = { ...job.ticket, reprint: true };
    await tx.update(kitchenPrintJobs).set({ status: "queued", ticket, attempts: 0, leaseToken: null, leaseExpiresAt: null, nextAttemptAt: new Date(), updatedAt: new Date(), lastError: null })
      .where(eq(kitchenPrintJobs.id, id));
    return true;
  });
}
