import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectionSyncQueue, getConnectionById } from "@avatar/core";

import { withApiGuard } from "@/lib/api";

const schema = z.object({
  connectionId: z.string().uuid(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const connection = await getConnectionById(parsed.data.connectionId);
    if (!connection || connection.userId !== userId) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    await connectionSyncQueue.add(
      `sync-${connection.provider}-${connection.id}-${Date.now()}`,
      {
        userId,
        provider: connection.provider as "github" | "youtube" | "x",
        connectionId: connection.id,
      },
      {
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
    return NextResponse.json({ queued: true });
  });
}

