import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listMemories, upsertMemory } from "@avatar/core";

import { deps } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

const createSchema = z.object({
  type: z.enum(["fact", "preference", "project", "person"]),
  content: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1).optional(),
  pinned: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const memories = await listMemories(userId);
    return NextResponse.json({ memories });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const embedding = (await deps.embeddings.embed(parsed.data.content))[0];
    const memory = await upsertMemory({
      userId,
      type: parsed.data.type,
      content: parsed.data.content,
      confidence: parsed.data.confidence ?? 0.7,
      pinned: parsed.data.pinned ?? false,
      sourceRefs: {
        source: "manual",
      },
      embedding,
    });
    return NextResponse.json({ memory });
  });
}

