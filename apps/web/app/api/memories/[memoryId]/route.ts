import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deleteMemory, upsertMemory } from "@avatar/core";

import { deps } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

const updateSchema = z.object({
  type: z.enum(["fact", "preference", "project", "person"]).optional(),
  content: z.string().min(1).max(4000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ memoryId: string }> },
): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const params = await context.params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (!parsed.data.type || !parsed.data.content) {
      return NextResponse.json(
        { error: "type and content are required for updates in this MVP" },
        { status: 400 },
      );
    }
    const embedding = (await deps.embeddings.embed(parsed.data.content))[0];
    const memory = await upsertMemory({
      userId,
      memoryId: params.memoryId,
      type: parsed.data.type,
      content: parsed.data.content,
      confidence: parsed.data.confidence ?? 0.7,
      pinned: parsed.data.pinned ?? false,
      sourceRefs: {
        source: "manual_edit",
      },
      embedding,
    });
    return NextResponse.json({ memory });
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ memoryId: string }> },
): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const { memoryId } = await context.params;
    await deleteMemory({ userId, memoryId });
    return NextResponse.json({ ok: true });
  });
}

