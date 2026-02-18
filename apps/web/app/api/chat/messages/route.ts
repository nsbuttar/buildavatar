import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getConversationById, getConversationMessages } from "@avatar/core";

import { withApiGuard } from "@/lib/api";

const querySchema = z.object({
  conversationId: z.string().uuid(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const parsed = querySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const conversation = await getConversationById({
      userId,
      conversationId: parsed.data.conversationId,
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const messages = await getConversationMessages(parsed.data.conversationId, 200);
    return NextResponse.json({ messages });
  });
}

