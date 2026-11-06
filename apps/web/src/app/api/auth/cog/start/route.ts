import { NextRequest, NextResponse } from "next/server";
import { oidcConfig, requestOrigin, startFlow, FLOW_COOKIE, CHECK_COOKIE } from "@/lib/cog-oidc";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const origin = requestOrigin(req.headers);
  const config = oidcConfig(origin);
  if (!config) return new NextResponse("Não encontrado", { status: 404 });
  const flow = await startFlow(config, req.nextUrl.searchParams.get("next"), req.nextUrl.searchParams.get("interactive")==="1");
  const response = NextResponse.redirect(flow.url, 303);
  const options = { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax" as const, path: "/", maxAge: 300 };
  response.cookies.set(FLOW_COOKIE, flow.cookie, options);
  response.cookies.set(CHECK_COOKIE, "1", options);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
