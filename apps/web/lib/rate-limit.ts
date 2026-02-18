const bucket = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(input: {
  key: string;
  maxRequests: number;
  windowMs: number;
}): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const existing = bucket.get(input.key);
  if (!existing || existing.resetAt <= now) {
    bucket.set(input.key, {
      count: 1,
      resetAt: now + input.windowMs,
    });
    return {
      allowed: true,
      remaining: input.maxRequests - 1,
      resetAt: now + input.windowMs,
    };
  }
  if (existing.count >= input.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }
  existing.count += 1;
  bucket.set(input.key, existing);
  return {
    allowed: true,
    remaining: input.maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

