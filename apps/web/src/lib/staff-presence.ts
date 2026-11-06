/** A foreground heartbeat every 25s tolerates brief network interruptions. */
export const PRESENCE_TTL_MS = 90_000;
export function isStaffOnline(presence: { available: boolean; lastSeenAt: Date | string } | null | undefined, now = Date.now()): boolean {
  if (!presence?.available) return false;
  const age = now - new Date(presence.lastSeenAt).getTime();
  return age >= 0 && age < PRESENCE_TTL_MS;
}
