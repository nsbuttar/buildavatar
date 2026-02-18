import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  appendAuditLog,
  connectionSyncQueue,
  type ConnectionRecord,
  disconnectConnection,
  isLiteRuntime,
  listConnections,
  setDefaultConnectedLlmProvider,
  updateConnectionSyncState,
  upsertConnection,
} from "@avatar/core";

import { connectors, ingestionService } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

type SyncableProvider = "github" | "youtube" | "x";
type ConnectedLlmProvider = "openai" | "gemini";

const SYNCABLE_PROVIDERS = ["github", "youtube", "x"] as const;

const DEFAULT_LLM_MODELS: Record<ConnectedLlmProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
};

const connectSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("github"),
    accessToken: z.string().min(20),
    scopes: z.array(z.string()).optional(),
  }),
  z.object({
    provider: z.literal("youtube"),
    apiKey: z.string().min(10),
    channelId: z.string().min(5),
  }),
  z.object({
    provider: z.literal("x"),
    placeholder: z.boolean().optional(),
  }),
  z.object({
    provider: z.literal("openai"),
    apiKey: z.string().min(20),
    model: z.string().min(3).optional(),
    setDefault: z.boolean().optional(),
  }),
  z.object({
    provider: z.literal("gemini"),
    apiKey: z.string().min(20),
    model: z.string().min(3).optional(),
    setDefault: z.boolean().optional(),
  }),
]);

const deleteSchema = z.object({
  provider: z.enum(["github", "youtube", "x", "openai", "gemini"]),
});

const defaultLlmSchema = z.object({
  provider: z.enum(["openai", "gemini"]),
});

function isSyncableProvider(provider: string): provider is SyncableProvider {
  return SYNCABLE_PROVIDERS.includes(provider as SyncableProvider);
}

function serializeConnection(connection: ConnectionRecord) {
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    scopes: connection.scopes,
    metadata: connection.metadata,
    lastSyncedAt: connection.lastSyncedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

async function enqueueOrRunConnectionSync(input: {
  userId: string;
  connection: ConnectionRecord;
}): Promise<void> {
  const { connection, userId } = input;
  if (!isSyncableProvider(connection.provider)) return;

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
    return;
  }

  await connectionSyncQueue.add(
    `sync-${connection.provider}-${connection.id}`,
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
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const connections = await listConnections(userId);
    return NextResponse.json({
      connections: connections.map((connection) => serializeConnection(connection)),
    });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const body = await request.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.provider === "x") {
      return NextResponse.json(
        {
          connected: false,
          message:
            "X connector skeleton is installed. Add enterprise API credentials and sync logic to enable ingestion.",
        },
        { status: 202 },
      );
    }

    let connection: ConnectionRecord;

    if (parsed.data.provider === "github") {
      connection = await upsertConnection({
        userId,
        provider: "github",
        status: "connected",
        scopes: parsed.data.scopes ?? ["repo", "read:user"],
        tokens: {
          accessToken: parsed.data.accessToken,
        },
      });
      await enqueueOrRunConnectionSync({
        userId,
        connection,
      });
    } else if (parsed.data.provider === "youtube") {
      connection = await upsertConnection({
        userId,
        provider: "youtube",
        status: "connected",
        scopes: ["youtube.readonly"],
        secrets: {
          apiKey: parsed.data.apiKey,
          channelId: parsed.data.channelId,
        },
        metadata: {
          channelId: parsed.data.channelId,
        },
      });
      await enqueueOrRunConnectionSync({
        userId,
        connection,
      });
    } else {
      const model =
        parsed.data.model?.trim() || DEFAULT_LLM_MODELS[parsed.data.provider];
      const setDefault = parsed.data.setDefault ?? true;
      connection = await upsertConnection({
        userId,
        provider: parsed.data.provider,
        status: "connected",
        scopes: ["llm:chat"],
        tokens: {
          apiKey: parsed.data.apiKey,
        },
        metadata: {
          model,
          isDefault: setDefault,
        },
      });
      if (setDefault) {
        await setDefaultConnectedLlmProvider({
          userId,
          provider: parsed.data.provider,
        });
      }
    }

    await appendAuditLog(null, {
      userId,
      action: "connection.connected",
      objectType: "connection",
      objectId: connection.id,
      details: { provider: connection.provider },
    });
    return NextResponse.json({ connection: serializeConnection(connection) });
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const body = await request.json();
    const parsed = defaultLlmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      await setDefaultConnectedLlmProvider({
        userId,
        provider: parsed.data.provider,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unable to set default LLM provider",
        },
        { status: 400 },
      );
    }

    await appendAuditLog(null, {
      userId,
      action: "connection.default_llm_set",
      objectType: "connection",
      objectId: parsed.data.provider,
      details: { provider: parsed.data.provider },
    });

    const connections = await listConnections(userId);
    return NextResponse.json({
      ok: true,
      connections: connections.map((connection) => serializeConnection(connection)),
    });
  });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await disconnectConnection(userId, parsed.data.provider);
    await appendAuditLog(null, {
      userId,
      action: "connection.disconnected",
      objectType: "connection",
      objectId: parsed.data.provider,
      details: { provider: parsed.data.provider },
    });
    return NextResponse.json({ ok: true });
  });
}

