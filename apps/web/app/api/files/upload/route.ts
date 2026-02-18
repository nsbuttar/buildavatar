import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  appendAuditLog,
  createKnowledgeItem,
  ingestionQueue,
  isLiteRuntime,
  sha256Hex,
} from "@avatar/core";

import { deps, ingestionService } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

const supportedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(
    request,
    async ({ userId }) => {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required" }, { status: 400 });
      }
      const mimeType = file.type || "application/octet-stream";
      if (!supportedTypes.has(mimeType)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${mimeType}` },
          { status: 400 },
        );
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const objectKey = `${userId}/files/${Date.now()}-${randomUUID()}-${file.name.replace(/\s+/g, "_")}`;
      await deps.storage.putObject({
        key: objectKey,
        contentType: mimeType,
        bytes,
      });
      const contentHash = sha256Hex(bytes);
      const knowledgeItem = await createKnowledgeItem({
        userId,
        source: "file_drop",
        sourceId: objectKey,
        title: file.name,
        contentHash,
        rawText: null,
        rawJson: {
          objectKey,
          fileName: file.name,
          mimeType,
          size: file.size,
        },
        metadata: {
          filename: file.name,
          objectKey,
          mimeType,
        },
      });
      if (isLiteRuntime()) {
        await ingestionService.ingestFile({
          userId,
          knowledgeItemId: knowledgeItem.id,
          objectKey,
          fileName: file.name,
          mimeType,
        });
      } else {
        await ingestionQueue.add(
          `file-${knowledgeItem.id}`,
          {
            kind: "file",
            userId,
            knowledgeItemId: knowledgeItem.id,
            objectKey,
            fileName: file.name,
            mimeType,
          },
          {
            removeOnComplete: 100,
            removeOnFail: 1000,
          },
        );
      }
      await appendAuditLog(null, {
        userId,
        action: "file.uploaded",
        objectType: "knowledge_item",
        objectId: knowledgeItem.id,
        details: {
          fileName: file.name,
          objectKey,
          mimeType,
          size: file.size,
        },
      });
      return NextResponse.json({
        ok: true,
        knowledgeItemId: knowledgeItem.id,
      });
    },
    { maxRequests: 30, windowMs: 60_000 },
  );
}

