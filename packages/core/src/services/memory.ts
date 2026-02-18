import type { EmbeddingAdapter, LlmAdapter, VectorStoreAdapter } from "../adapters/interfaces";
import { logger } from "../logger";
import {
  getConversationMessages,
  listMemories,
  saveMessage,
  upsertMemory,
} from "./repositories";

export async function runMemoryReflection(
  deps: {
    llm: LlmAdapter;
    embeddings: EmbeddingAdapter;
    vectorStore: VectorStoreAdapter;
  },
  input: {
    userId: string;
    conversationId: string;
    allowLearningFromConversations: boolean;
    messageLimit?: number;
  },
): Promise<{ created: number; updated: number }> {
  if (!input.allowLearningFromConversations) {
    logger.info("memory reflection skipped", {
      userId: input.userId,
      conversationId: input.conversationId,
      reason: "learning_disabled",
    });
    return { created: 0, updated: 0 };
  }
  const messages = await getConversationMessages(input.conversationId, input.messageLimit ?? 40);
  if (messages.length === 0) {
    return { created: 0, updated: 0 };
  }
  const conversationText = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
  const existingMemories = await listMemories(input.userId);

  const extracted = await deps.llm.extractMemories({
    conversation: conversationText,
    existingMemories: existingMemories.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
    })),
  });

  let created = 0;
  let updated = 0;
  for (const memory of extracted) {
    if (!memory.content.trim()) continue;
    const embedding = (await deps.embeddings.embed(memory.content))[0];
    let memoryId: string | undefined = memory.shouldUpdateId;

    if (!memoryId) {
      const nearest = await deps.vectorStore.memorySearch({
        userId: input.userId,
        query: memory.content,
        embedding,
        k: 1,
      });
      if (nearest[0] && nearest[0].score && nearest[0].score > 0.93) {
        memoryId = nearest[0].id;
      }
    }

    const upserted = await upsertMemory({
      userId: input.userId,
      memoryId,
      type: memory.type,
      content: memory.content,
      confidence: Math.max(0, Math.min(1, memory.confidence)),
      sourceRefs: {
        source: "conversation",
        conversationId: input.conversationId,
      },
      embedding,
    });
    if (memoryId) updated += 1;
    else if (upserted.id) created += 1;
  }

  await saveMessage({
    conversationId: input.conversationId,
    role: "system",
    content: `[Reflection] stored memories: created=${created}, updated=${updated}`,
  });
  return { created, updated };
}

