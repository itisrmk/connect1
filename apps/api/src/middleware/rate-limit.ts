import type { Context, Next } from "hono";
import type { AppEnv } from "../types.js";
import { getRedis } from "../lib/redis.js";
import { rateLimited } from "../lib/errors.js";

const PLAN_LIMITS: Record<string, number> = {
  free: 1000,
  starter: 5000,
  pro: 50000,
  enterprise: 500000,
};

const WINDOW_SECONDS = 3600; // 1 hour

export async function rateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  const redis = getRedis();
  if (!redis) {
    // No Redis — skip rate limiting (local dev)
    await next();
    return;
  }

  const tenantId = c.get("tenantId");
  const tenant = c.get("tenant");
  const plan = tenant?.plan ?? "free";
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  const now = Math.floor(Date.now() / 1000);
  const windowKey = `ratelimit:${tenantId}:${Math.floor(now / WINDOW_SECONDS)}`;
  const usageKey = `usage:${tenantId}:${new Date().toISOString().split("T")[0]}`;

  try {
    const current = await redis.incr(windowKey);
    if (current === 1) {
      await redis.expire(windowKey, WINDOW_SECONDS);
    }

    // Track daily usage (for billing)
    await redis.incr(usageKey);
    // Keep daily counters for 90 days
    if ((await redis.ttl(usageKey)) === -1) {
      await redis.expire(usageKey, 90 * 86400);
    }

    const remaining = Math.max(0, limit - current);
    const reset = (Math.floor(now / WINDOW_SECONDS) + 1) * WINDOW_SECONDS;

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(reset));

    if (current > limit) {
      throw rateLimited(reset - now);
    }
  } catch (err) {
    // If it's our rate limit error, re-throw
    if (err instanceof Error && err.message === "Rate limit exceeded") throw err;
    // Redis errors — fail open
    console.warn("Rate limit check failed:", err);
  }

  await next();
}
