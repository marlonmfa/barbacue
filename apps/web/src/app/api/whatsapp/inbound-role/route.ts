import { timingSafeEqual } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { resolveAI } from "@/lib/ai-settings";
import { barbaContactPhone } from "@/lib/barba-contact";
import { declareCourierAvailable } from "@/lib/courier-availability";
import { declaresCourierAvailability } from "@/lib/courier-availability-message";
import { findBarbaContactRole } from "@/lib/barba-contact-role";

const inputSchema = z.object({
  phone: z.string().regex(/^[1-9]\d{6,14}$/),
  text: z.string().trim().min(1).max(10_000),
});

const deliveryStatus = { assigned: "Atribuída", out_for_delivery: "Em rota" };

async function driverReply(driverId: number | null) {
  if (driverId === null) return "Seu WhatsApp precisa estar vinculado ao seu cadastro de entregador para consultar suas entregas.";
  const deliveries = await db.select({
    address: orders.deliveryAddress, brand: orders.brand, status: orders.deliveryStatus,
  }).from(orders).where(and(
    eq(orders.deliveryDriverId, driverId), eq(orders.orderType, "delivery"),
    isNull(orders.archivedAt), inArray(orders.deliveryStatus, ["assigned", "out_for_delivery"]),
    inArray(orders.status, ["pending", "confirmed", "preparing", "ready"]),
  )).orderBy(asc(orders.dispatchPosition), asc(orders.createdAt)).limit(12);

  if (!deliveries.length) return "Você não tem entregas em andamento atribuídas ao seu cadastro.";
  return ["*Suas entregas em andamento*", ...deliveries.map((delivery) =>
    `• ${delivery.brand} · ${delivery.status === "out_for_delivery" ? deliveryStatus.out_for_delivery : deliveryStatus.assigned}\n${delivery.address || "Endereço disponível no painel de entregas."}`,
  )].join("\n\n");
}

async function managementReply(role: "admin" | "manager", question: string) {
  const operationalDate = sql`coalesce(${orders.sourceCreatedAt}, ${orders.createdAt})`;
  const snapshot = await db.select({ brand: orders.brand, status: orders.status, orders: count() })
    .from(orders).where(and(
      gte(operationalDate, sql`date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`),
      isNull(orders.archivedAt), sql`${orders.channel} IS DISTINCT FROM 'test'`,
    )).groupBy(orders.brand, orders.status);
  const modules = "Pedidos, caixa, despacho e entregas, cardápio, equipe e atendimento WhatsApp.";
  const extraModules = "Integrações iFood e Anota Aí, financeiro e configurações do sistema.";
  const fallback = [
    `*Atendimento interno*\nÁreas do painel: ${modules}${role === "admin" ? ` ${extraModules}` : ""}`,
    "Pedidos de hoje por restaurante e situação:",
    ...snapshot.map((row) => `• ${row.brand} · ${row.status ?? "sem situação"}: ${row.orders}`),
    ...(snapshot.length ? [] : ["• Nenhum pedido registrado."]),
    "Painel: https://barbacue.cog.ia.br/admin",
  ].join("\n");

  try {
    const { provider, model, apiKey } = await resolveAI();
    if (!apiKey) return fallback;
    const client = new OpenAI({
      apiKey, ...(provider === "anthropic" ? { baseURL: "https://api.anthropic.com/v1/" } : {}),
      timeout: 15_000, maxRetries: 0,
    });
    const result = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: [
          "Você atende a equipe do Grupo Barba em português brasileiro pelo WhatsApp. Responda à pergunta sobre o sistema.",
          role === "admin" ? `Perfil administrador. Áreas do painel: ${modules} ${extraModules}`
            : `Perfil gerente. Restrinja as respostas à operação: ${modules}`,
          "Você pode orientar o uso do painel e consultar os totais abaixo. Quando faltarem dados, indique a área pertinente do painel.",
          "Use apenas o contexto fornecido para fatos sobre o sistema. Não invente dados, caminhos ou ações realizadas. Você não tem ferramentas e não pode alterar o sistema.",
          "Painel de gestão: https://barbacue.cog.ia.br/admin",
          `Totais de pedidos de hoje em São Paulo, agrupados por restaurante e situação: ${JSON.stringify(snapshot)}`,
        ].join("\n") },
        { role: "user", content: question },
      ],
    });
    return result.choices[0]?.message.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  const expected = Buffer.from(process.env.BOT_API_TOKEN ?? "");
  const supplied = Buffer.from(request.headers.get("x-bot-token") ?? "");
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
    return Response.json({ error: "Acesso restrito ao bot." }, { status: 401 });
  }
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  const phone = input.success ? barbaContactPhone(`${input.data.phone}@s.whatsapp.net`) : null;
  if (!input.success || !phone) return Response.json({ error: "Mensagem inválida." }, { status: 422 });

  const { manualRole, staffRole, staff } = await findBarbaContactRole(phone);
  const role = manualRole ?? staffRole ?? "customer";
  const headers = { "Cache-Control": "no-store" };
  if (role === "driver") {
    const driverId = staffRole === "driver" ? staff?.id ?? null : null;
    if (declaresCourierAvailability(input.data.text)) {
      const until = driverId === null ? null : await declareCourierAvailable(driverId);
      const reply = until
        ? "Sua disponibilidade foi registrada no despacho até as 6h. Se precisar sair antes, avise a equipe ou fique offline em Minhas entregas."
        : "Para marcar disponibilidade, vincule este WhatsApp ao seu cadastro ativo de entregador com acesso a Minhas entregas.";
      return Response.json({ role, reply }, { headers });
    }
    return Response.json({ role, reply: await driverReply(driverId) }, { headers });
  }
  if (role === "admin" || role === "manager") {
    return Response.json({ role, reply: await managementReply(role, input.data.text) }, { headers });
  }
  return Response.json({ role: "customer" }, { headers });
}
