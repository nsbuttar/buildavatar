import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  appendAuditLog,
  createConversation,
  getUserById,
  saveMessage,
} from "@avatar/core";

import { resolveHookUserIdCandidate, withHookGuard } from "@/lib/hooks";

const wakeSchema = z.object({
  userId: z.string().min(1).optional(),
  text: z.string().min(1).max(4000),
  mode: z.enum(["now", "next-heartbeat"]).optional(),
  name: z.string().min(1).max(80).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withHookGuard(request, async ({ requestId }) => {
    const body = await request.json().catch(() => null);
    const parsed = wakeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const userId = resolveHookUserIdCandidate(parsed.data.userId);
    if (!userId) {
      return NextResponse.json(
        {
          error:
            "No hook target user configured. Provide userId in payload or set HOOKS_DEFAULT_USER_ID.",
        },
        { status: 400 },
      );
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "Hook target user not found" }, { status: 404 });
    }

    const sourceName = parsed.data.name?.trim();
    const title = sourceName ? `Hook Wake: ${sourceName}` : "Hook Wake Event";
    const conversation = await createConversation({
      userId,
      title,
    });

    const content = sourceName
      ? `[${sourceName}] ${parsed.data.text}`
      : parsed.data.text;
    await saveMessage({
      conversationId: conversation.id,
      role: "system",
      content,
    });

    const mode = parsed.data.mode ?? "now";
    await appendAuditLog(null, {
      userId,
      action: "hook.wake.received",
      objectType: "hook",
      objectId: conversation.id,
      details: {
        requestId,
        mode,
        name: sourceName ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      mode,
      requestId,
    });
  });
}
