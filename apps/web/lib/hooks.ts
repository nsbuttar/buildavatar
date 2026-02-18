import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { logger } from "@avatar/core";

import { rateLimit } from "./rate-limit";

interface HookGuardContext {
  requestId: string;
}

function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

function getPresentedHookToken(request: NextRequest): string | null {
  return (
    extractBearerToken(request.headers.get("authorization")) ??
    request.headers.get("x-openclaw-token")?.trim() ??
    request.headers.get("x-avatar-hook-token")?.trim() ??
    null
  );
}

function getClientAddress(request: NextRequest): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const [firstAddress] = xForwardedFor.split(",");
    const resolved = firstAddress?.trim();
    if (resolved) return resolved;
  }
  const xRealIp = request.headers.get("x-real-ip")?.trim();
  if (xRealIp) return xRealIp;
  return "unknown";
}

export function resolveHookUserIdCandidate(requestedUserId?: string): string | null {
  const fromPayload = requestedUserId?.trim();
  if (fromPayload) return fromPayload;
  const fromEnv = process.env.HOOKS_DEFAULT_USER_ID?.trim();
  return fromEnv || null;
}

export async function withHookGuard(
  request: NextRequest,
  handler: (context: HookGuardContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const clientAddress = getClientAddress(request);

  const rateLimitResult = rateLimit({
    key: `hooks:${request.nextUrl.pathname}:${clientAddress}`,
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "Rate limit exceeded", requestId },
      {
        status: 429,
        headers: {
          "x-request-id": requestId,
          "retry-after": String(retryAfterSeconds),
        },
      },
    );
  }

  const expectedToken = process.env.HOOKS_TOKEN?.trim();
  if (!expectedToken) {
    logger.error("hooks_token_missing", { requestId });
    return NextResponse.json(
      { error: "Webhook ingress is not configured", requestId },
      {
        status: 503,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  }

  const presentedToken = getPresentedHookToken(request);
  if (!presentedToken || presentedToken !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized", requestId },
      {
        status: 401,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  }

  try {
    const response = await handler({ requestId });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    logger.error("hook_route_error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error", requestId },
      {
        status: 500,
        headers: {
          "x-request-id": requestId,
        },
      },
    );
  }
}
