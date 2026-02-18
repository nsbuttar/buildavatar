import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createConversation, listConversations } from "@avatar/core";

import { withApiGuard } from "@/lib/api";

const createSchema = z.object({
  title: z.string().max(200).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const conversations = await listConversations(userId);
    return NextResponse.json({ conversations });
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const conversation = await createConversation({
      userId,
      title: parsed.data.title,
    });
    return NextResponse.json({ conversation });
  });
}

