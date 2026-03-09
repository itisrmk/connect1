import type { Context } from "hono";
import { Connect1APIError } from "../lib/errors.js";

export function errorHandler(err: Error, c: Context) {
  if (err instanceof Connect1APIError) {
    const body: Record<string, unknown> = {
      error: { code: err.code, message: err.message },
    };
    // Add retryAfter for rate limit errors
    if ("retryAfter" in err) {
      c.header("Retry-After", String((err as Connect1APIError & { retryAfter: number }).retryAfter));
    }
    return c.json(body, err.status as 400);
  }

  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL", message: "Internal server error" } },
    500
  );
}
