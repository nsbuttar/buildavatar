import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  appendAuditLog,
  connectionSyncQueue,
  disconnectConnection,
  isLiteRuntime,
  listConnections,
  updateConnectionSyncState,
  upsertConnection,
} from "@avatar/core";

import { connectors, ingestionService } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

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
]);

const deleteSchema = z.object({
  provider: z.enum(["github", "youtube", "x"]),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const connections = await listConnections(userId);
    return NextResponse.json({ connections });
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

    const connection =
      parsed.data.provider === "github"
        ? await upsertConnection({
            userId,
            provider: "github",
            status: "connected",
            scopes: parsed.data.scopes ?? ["repo", "read:user"],
            tokens: {
              accessToken: parsed.data.accessToken,
            },
          })
        : await upsertConnection({
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

    if (isLiteRuntime()) {
      await updateConnectionSyncState({
        connectionId: connection.id,
        status: "pending",
      });
      try {
        await ingestionService.syncConnection({
          userId,
          connectionId: connection.id,
          connector: connectors[connection.provider as "github" | "youtube" | "x"],
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
    } else {
      await connectionSyncQueue.add(
        `sync-${connection.provider}-${connection.id}`,
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
    }

    await appendAuditLog(null, {
      userId,
      action: "connection.connected",
      objectType: "connection",
      objectId: connection.id,
      details: { provider: connection.provider },
    });
    return NextResponse.json({ connection });
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

