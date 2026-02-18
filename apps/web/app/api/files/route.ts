import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  appendAuditLog,
  getKnowledgeItemById,
  listKnowledgeItems,
  softDeleteKnowledgeItem,
} from "@avatar/core";

import { deps } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

const deleteSchema = z.object({
  knowledgeItemId: z.string().uuid(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const items = await listKnowledgeItems(userId);
    return NextResponse.json({
      items,
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
    const item = await getKnowledgeItemById({
      userId,
      knowledgeItemId: parsed.data.knowledgeItemId,
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const objectKey =
      (item.metadata?.objectKey as string | undefined) ??
      (item.rawJson?.objectKey as string | undefined);
    if (objectKey) {
      await deps.storage.deleteObject(objectKey).catch(() => null);
    }
    await softDeleteKnowledgeItem({
      userId,
      knowledgeItemId: parsed.data.knowledgeItemId,
    });
    await appendAuditLog(null, {
      userId,
      action: "knowledge_item.deleted",
      objectType: "knowledge_item",
      objectId: parsed.data.knowledgeItemId,
      details: {
        source: item.source,
      },
    });
    return NextResponse.json({ ok: true });
  });
}

