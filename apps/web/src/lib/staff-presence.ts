/** A foreground heartbeat every 25s tolerates brief network interruptions. */
export const PRESENCE_TTL_MS = 90_000;
export function isStaffOnline(presence: { available: boolean; lastSeenAt: Date | string; declaredAvailableUntil?: Date | string | null } | null | undefined, now = Date.now()): boolean {
  if (!presence?.available) return false;
  if (presence.declaredAvailableUntil && new Date(presence.declaredAvailableUntil).getTime() > now) return true;
  const age = now - new Date(presence.lastSeenAt).getTime();
  return age >= 0 && age < PRESENCE_TTL_MS;
}
