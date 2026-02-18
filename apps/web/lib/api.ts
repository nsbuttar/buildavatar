import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { logger } from "@avatar/core";

import { requireUserId } from "./session";
import { rateLimit } from "./rate-limit";

export async function withApiGuard(
  request: NextRequest,
  handler: (context: { userId: string; requestId: string }) => Promise<NextResponse>,
  options?: { maxRequests?: number; windowMs?: number },
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const userId = await requireUserId();
    const rl = rateLimit({
      key: `${userId}:${request.nextUrl.pathname}`,
      maxRequests: options?.maxRequests ?? 60,
      windowMs: options?.windowMs ?? 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", requestId },
        {
          status: 429,
          headers: {
            "x-request-id": requestId,
          },
        },
      );
    }
    const response = await handler({ userId, requestId });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    logger.error("api_guard_error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
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
}

