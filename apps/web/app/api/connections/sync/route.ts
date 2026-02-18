import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  connectionSyncQueue,
  getConnectionById,
  isLiteRuntime,
  updateConnectionSyncState,
} from "@avatar/core";

import { connectors, ingestionService } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

type SyncableProvider = "github" | "youtube" | "x";

const SYNCABLE_PROVIDERS = ["github", "youtube", "x"] as const;

function isSyncableProvider(provider: string): provider is SyncableProvider {
  return SYNCABLE_PROVIDERS.includes(provider as SyncableProvider);
}

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
    if (!isSyncableProvider(connection.provider)) {
      return NextResponse.json(
        { error: `Provider ${connection.provider} does not support sync` },
        { status: 400 },
      );
    }
    if (isLiteRuntime()) {
      await updateConnectionSyncState({
        connectionId: connection.id,
        status: "pending",
      });
      try {
        await ingestionService.syncConnection({
          userId,
          connectionId: connection.id,
          connector: connectors[connection.provider],
        });
        await updateConnectionSyncState({
          connectionId: connection.id,
          status: "connected",
        });
      } catch (error) {
        await updateConnectionSyncState({
          connectionId: connection.id,
          status: "error",
        });
        throw error;
      }
      return NextResponse.json({ queued: false, synced: true });
    }

    await connectionSyncQueue.add(
      `sync-${connection.provider}-${connection.id}-${Date.now()}`,
      {
        userId,
        provider: connection.provider,
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

