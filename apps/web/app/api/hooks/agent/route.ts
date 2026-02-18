import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  appendAuditLog,
  createConversation,
  getConversationById,
  getConversationMessages,
  getUserById,
  isLiteRuntime,
  reflectionQueue,
  resolveUserLlmAdapter,
  runAgent,
  runMemoryReflection,
  saveMessage,
  type LlmAdapter,
} from "@avatar/core";

import { deps } from "@/lib/deps";
import { resolveHookUserIdCandidate, withHookGuard } from "@/lib/hooks";

const agentSchema = z.object({
  userId: z.string().min(1).optional(),
  message: z.string().min(1).max(6000),
  name: z.string().min(1).max(80).optional(),
  conversationId: z.string().uuid().optional(),
  confirmedActions: z.array(z.string().min(1)).optional(),
  wakeMode: z.enum(["now", "next-heartbeat"]).optional(),
});

async function queueReflectionIfNeeded(input: {
  userId: string;
  conversationId: string;
  llm: LlmAdapter;
  allowLearningFromConversations: boolean;
}): Promise<void> {
  const messages = await getConversationMessages(input.conversationId, 100);
  if (messages.length % 10 !== 0) return;

  if (isLiteRuntime()) {
    await runMemoryReflection(
      {
        llm: input.llm,
        embeddings: deps.embeddings,
        vectorStore: deps.vectorStore,
      },
      {
        userId: input.userId,
        conversationId: input.conversationId,
        allowLearningFromConversations: input.allowLearningFromConversations,
      },
    );
    return;
  }

  await reflectionQueue.add(
    `reflection-${input.conversationId}-${Date.now()}`,
    {
      userId: input.userId,
      conversationId: input.conversationId,
      messageIds: messages.map((message) => message.id),
    },
    {
      removeOnComplete: 100,
      removeOnFail: 1000,
    },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withHookGuard(request, async ({ requestId }) => {
    const body = await request.json().catch(() => null);
    const parsed = agentSchema.safeParse(body);
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

    let conversationId = parsed.data.conversationId;
    if (conversationId) {
      const existingConversation = await getConversationById({
        userId,
        conversationId,
      });
      if (!existingConversation) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    } else {
      const titlePrefix = parsed.data.name?.trim();
      const title = titlePrefix
        ? `Hook Agent: ${titlePrefix}`
        : `Hook Agent: ${parsed.data.message.slice(0, 64)}`;
      const createdConversation = await createConversation({ userId, title });
      conversationId = createdConversation.id;
    }

    const finalConversationId = conversationId;
    if (!finalConversationId) {
      throw new Error("Conversation resolution failed");
    }

    await saveMessage({
      conversationId: finalConversationId,
      role: "user",
      content: parsed.data.message,
    });

    const { adapter: llm } = await resolveUserLlmAdapter({
      userId,
      fallback: deps.llm,
    });
    const agentResult = await runAgent(
      {
        llm,
        embeddings: deps.embeddings,
        vectorStore: deps.vectorStore,
      },
      {
        userId,
        query: parsed.data.message,
        confirmedActions: parsed.data.confirmedActions,
      },
    );

    await saveMessage({
      conversationId: finalConversationId,
      role: "assistant",
      content: agentResult.response,
    });

    await queueReflectionIfNeeded({
      userId,
      conversationId: finalConversationId,
      llm,
      allowLearningFromConversations: user.allowLearningFromConversations,
    });

    await appendAuditLog(null, {
      userId,
      action: "hook.agent.completed",
      objectType: "hook",
      objectId: finalConversationId,
      details: {
        requestId,
        wakeMode: parsed.data.wakeMode ?? "now",
        name: parsed.data.name ?? null,
        toolCalls: agentResult.toolResults.length,
        proposedActions: agentResult.proposedActions.length,
      },
    });

    return NextResponse.json({
      ok: true,
      conversationId: finalConversationId,
      answer: agentResult.response,
      toolCalls: agentResult.toolResults,
      proposedActions: agentResult.proposedActions,
      requestId,
    });
  });
}
