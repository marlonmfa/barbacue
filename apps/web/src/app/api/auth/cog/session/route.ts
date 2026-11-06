import { resolveNativeCogEmail, NATIVE_COG_HEADER } from "@/lib/cog-native";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/admin-auth";
import { getMember } from "@/lib/member-auth";
import { actorView } from "@/lib/session-view";
import { oidcConfig, requestOrigin, CHECK_COOKIE } from "@/lib/cog-oidc";
export const dynamic="force-dynamic";
export async function GET() {
  const h=await headers(), origin=requestOrigin(h);
  const nativeCogEmail=await resolveNativeCogEmail(h.get(NATIVE_COG_HEADER));
  const [staff,member]=await Promise.all([getStaffSession(),getMember()]);
  const view=await actorView(origin,staff,member);
  const store=await cookies();
  return NextResponse.json({view,refresh:h.get('X-Barbacue-Native')!=='1' && !nativeCogEmail && !!oidcConfig(origin) && !store.get(CHECK_COOKIE) && !!(staff || member || store.get("barbacue_cog_grant"))},
    {headers:{"Cache-Control":"no-store"}});
}
