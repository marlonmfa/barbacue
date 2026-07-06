// Tiny in-memory rate limiter for brute-force resistance on login/coupon probing.
// Per-process (fine for the single PM2 instance in production); resets on deploy.
// Not a substitute for a WAF, but closes the "unlimited master-password guesses"
// hole the audit flagged. Keyed by IP+purpose.

type Bucket = { count: number; resetAt: number; blockedUntil: number };
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * @param key      stable identity (e.g. `login:1.2.3.4`)
 * @param limit    allowed attempts within the window
 * @param windowMs rolling window length
 * @param blockMs  lockout duration once the limit is exceeded
 */
export function rateLimit(
  key: string,
  limit = 8,
  windowMs = 60_000,
  blockMs = 5 * 60_000,
  now: number = Date.now(),
): RateLimitResult {
  const b = buckets.get(key);

  if (b && b.blockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((b.blockedUntil - now) / 1000) };
  }

  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs, blockedUntil: 0 });
    return { ok: true, retryAfterSec: 0 };
  }

  b.count += 1;
  if (b.count > limit) {
    b.blockedUntil = now + blockMs;
    return { ok: false, retryAfterSec: Math.ceil(blockMs / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP from common proxy headers (nginx sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
