export class Connect1APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "Connect1APIError";
  }
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return new Connect1APIError(code, message, 400);
}

export function unauthorized(message = "Unauthorized", code = "UNAUTHORIZED") {
  return new Connect1APIError(code, message, 401);
}

export function notFound(message = "Not found", code = "NOT_FOUND") {
  return new Connect1APIError(code, message, 404);
}

export function rateLimited(retryAfter: number) {
  const err = new Connect1APIError(
    "RATE_LIMITED",
    "Rate limit exceeded",
    429
  );
  (err as Connect1APIError & { retryAfter: number }).retryAfter = retryAfter;
  return err;
}

export function providerError(message: string) {
  return new Connect1APIError("PROVIDER_ERROR", message, 502);
}

export function internal(message = "Internal server error") {
  return new Connect1APIError("INTERNAL", message, 500);
}
