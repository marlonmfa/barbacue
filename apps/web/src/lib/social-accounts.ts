import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts } from "@/db/schema";
import type { SocialProfile } from "@/lib/social-auth";

const column = (p: SocialProfile["provider"]) => (p === "instagram" ? customerAccounts.instagramId : customerAccounts.facebookId);
const providerFields = (profile: SocialProfile) =>
  profile.provider === "instagram"
    ? { instagramId: profile.id, instagramUsername: profile.username ?? null }
    : { facebookId: profile.id };

/**
 * Encontra ou cria a conta de cliente para um perfil social.
 * Ordem: conta já ligada a este perfil → cliente logado (liga o perfil a ele) →
 * mesmo e-mail confirmado pelo Facebook → conta nova.
 */
export async function upsertSocialAccount(profile: SocialProfile, currentMemberId: number | null): Promise<number> {
  const [linked] = await db.select({ id: customerAccounts.id }).from(customerAccounts).where(eq(column(profile.provider), profile.id));
  if (linked) {
    if (profile.provider === "instagram" && profile.username) {
      await db.update(customerAccounts).set({ instagramUsername: profile.username }).where(eq(customerAccounts.id, linked.id));
    }
    return linked.id;
  }

  if (currentMemberId) {
    const [updated] = await db.update(customerAccounts).set(providerFields(profile))
      .where(and(eq(customerAccounts.id, currentMemberId), isNull(column(profile.provider))))
      .returning({ id: customerAccounts.id });
    if (updated) return updated.id;
  }

  if (profile.email) {
    const [updated] = await db.update(customerAccounts).set(providerFields(profile))
      .where(and(eq(customerAccounts.email, profile.email), isNull(column(profile.provider))))
      .returning({ id: customerAccounts.id });
    if (updated) return updated.id;
  }

  const [created] = await db.insert(customerAccounts)
    .values({ name: profile.name, email: profile.email ?? null, ...providerFields(profile) })
    .onConflictDoNothing()
    .returning({ id: customerAccounts.id });
  if (created) return created.id;
  // E-mail já pertence a uma conta ligada a outro perfil do Facebook: cria sem e-mail.
  const [fallback] = await db.insert(customerAccounts)
    .values({ name: profile.name, email: null, ...providerFields(profile) })
    .returning({ id: customerAccounts.id });
  return fallback.id;
}
