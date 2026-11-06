import { oidcConfig, requestOrigin, revokeOidc, GRANT_COOKIE, FLOW_COOKIE, CHECK_COOKIE } from "@/lib/cog-oidc";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/staff-auth";
import { clearMemberCookie, getMember, setMemberCookie } from "@/lib/member-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { endCogSession } from '@/lib/cog-sso';
const schema = z.object({ mode: z.enum(["login", "register"]), name: z.string().trim().min(2).max(100).optional(), email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(8).max(128) });
export async function GET() { return NextResponse.json({ member: await getMember() }, { headers: { "Cache-Control": "no-store" } }); }
export async function POST(req: NextRequest) {
  const limit = rateLimit(`member-auth:${clientIp(req)}`, 8, 60_000, 300_000);
  if (!limit.ok) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe um e-mail válido e uma senha com 8 a 128 caracteres." }, { status: 422 });
  const { mode, name, email, password } = parsed.data;
  if (mode === "register" && !name) return NextResponse.json({ error: "Informe seu nome." }, { status: 422 });
  if (!process.env.ADMIN_COOKIE_SECRET || process.env.ADMIN_COOKIE_SECRET.length < 16) return NextResponse.json({ error: "A entrada de clientes ainda não está configurada." }, { status: 503 });
  let user;
  if (mode === "register") {
    const [created] = await db.insert(customerAccounts).values({ name: name!, email, passwordHash: await hashPassword(password) }).onConflictDoNothing({ target: customerAccounts.email }).returning({ id: customerAccounts.id, name: customerAccounts.name });
    if (!created) return NextResponse.json({ error: "Não foi possível criar a conta com este e-mail. Se já tem uma conta, use Entrar." }, { status: 409 });
    user = created;
  } else {
    const [existing] = await db.select().from(customerAccounts).where(eq(customerAccounts.email, email));
    if (!existing?.passwordHash || !(await verifyPassword(password, existing.passwordHash))) return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    user = existing;
  }
  const response = NextResponse.json({ ok: true }); setMemberCookie(response, user.id); return response;
}
export async function DELETE(req:NextRequest) {
  const central=req.cookies.get('cogia_sessao')?.value;
  try{await revokeOidc(oidcConfig(requestOrigin(req.headers)),req.cookies.get(GRANT_COOKIE)?.value);await endCogSession(central);}catch{return NextResponse.json({error:'Não foi possível encerrar a sessão Cog. Tente novamente.'},{status:503});}
  const response = NextResponse.json({ ok: true });
  if(central && process.env.COGIA_SSO_IDENTITY_KEY)response.cookies.set('cogia_sessao','',{domain:'cog.ia.br',path:'/',maxAge:0,httpOnly:true,secure:true,sameSite:'lax'});
  response.cookies.set(GRANT_COOKIE,'',{path:'/',maxAge:0});
  response.cookies.set(FLOW_COOKIE,'',{path:'/',maxAge:0});
  response.cookies.set(CHECK_COOKIE,'1',{path:'/',maxAge:300,httpOnly:true,secure:requestOrigin(req.headers).startsWith('https:'),sameSite:'lax'});
  clearMemberCookie(response);return response;
}
