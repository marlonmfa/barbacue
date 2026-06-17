import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type CustomerPrefill = {
  name: string;
  phone: string;
  address?: string;
};

const COOKIE_NAME = "barbacue_customer_session";
const MAX_AGE = 60 * 60 * 4; // 4 hours

export function setCustomerSession(res: NextResponse, data: CustomerPrefill): void {
  res.cookies.set(COOKIE_NAME, Buffer.from(JSON.stringify(data)).toString("base64url"), {
    httpOnly: false, // needs to be readable client-side for pre-fill
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearCustomerSession(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

/** Read from server component — returns null if no session */
export async function getCustomerSession(): Promise<CustomerPrefill | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString()) as CustomerPrefill;
  } catch {
    return null;
  }
}
