import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
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
  streamRagAnswer,
  type LlmAdapter,
} from "@avatar/core";

import { deps } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

const chatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(6000),
  agentMode: z.boolean().optional(),
  confirmedActions: z.array(z.string()).optional(),
});

async function queueReflectionIfNeeded(input: {
  userId: string;
  conversationId: string;
  llm: LlmAdapter;
}): Promise<void> {
  const messages = await getConversationMessages(input.conversationId, 100);
  if (messages.length % 10 !== 0) return;
  if (isLiteRuntime()) {
    const user = await getUserById(input.userId);
    if (!user) return;
    await runMemoryReflection(
      {
        llm: input.llm,
        embeddings: deps.embeddings,
        vectorStore: deps.vectorStore,
      },
      {
        userId: input.userId,
        conversationId: input.conversationId,
        allowLearningFromConversations: user.allowLearningFromConversations,
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
  return withApiGuard(
    request,
    async ({ userId }) => {
      const body = await request.json();
      const parsed = chatSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }

      let conversationId = parsed.data.conversationId;
      if (!conversationId) {
        const created = await createConversation({
          userId,
          title: parsed.data.message.slice(0, 80),
        });
        conversationId = created.id;
      } else {
        const existing = await getConversationById({
          userId,
          conversationId,
        });
        if (!existing) {
          return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }
      }
      const finalConversationId = conversationId;

      await saveMessage({
        conversationId: finalConversationId,
        role: "user",
        content: parsed.data.message,
      });
      const user = await getUserById(userId);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const { adapter: llm } = await resolveUserLlmAdapter({
        userId,
        fallback: deps.llm,
      });

      if (parsed.data.agentMode) {
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
        });
        return NextResponse.json({
          conversationId: finalConversationId,
          answer: agentResult.response,
          toolCalls: agentResult.toolResults,
          proposedActions: agentResult.proposedActions,
          citations: [],
        });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send = (event: string, payload: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
            );
          };

          void (async () => {
            try {
              send("meta", { conversationId: finalConversationId });
              const result = await streamRagAnswer(
                {
                  llm,
                  embeddings: deps.embeddings,
                  vectorStore: deps.vectorStore,
                },
                {
                  userId,
                  conversationId: finalConversationId,
                  query: parsed.data.message,
                  memoryLearningEnabled: user.allowLearningFromConversations,
                  onToken: (token: string) => send("token", { token }),
                },
              );
              send("done", {
                answer: result.answer,
                citations: result.citations,
              });
              await queueReflectionIfNeeded({
                userId,
                conversationId: finalConversationId,
                llm,
              });
            } catch (error) {
              send("error", {
                message: error instanceof Error ? error.message : "Unknown error",
              });
            } finally {
              controller.close();
            }
          })();
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    },
    { maxRequests: 40, windowMs: 60_000 },
  );
}
