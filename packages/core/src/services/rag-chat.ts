import type { EmbeddingAdapter, LlmAdapter, VectorStoreAdapter } from "../adapters/interfaces";
import type { ChatResponse, Message } from "../types/domain";
import { getConversationMessages, saveMessage } from "./repositories";

export interface RagChatDependencies {
  llm: LlmAdapter;
  embeddings: EmbeddingAdapter;
  vectorStore: VectorStoreAdapter;
}

function formatMessages(messages: Message[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

export async function generateRagAnswer(
  deps: RagChatDependencies,
  input: {
    userId: string;
    conversationId: string;
    query: string;
    memoryLearningEnabled: boolean;
  },
): Promise<ChatResponse> {
  const queryEmbedding = (await deps.embeddings.embed(input.query))[0];
  const [chunks, memories, recentMessages] = await Promise.all([
    deps.vectorStore.similaritySearch({
      userId: input.userId,
      embedding: queryEmbedding,
      k: 6,
    }),
    deps.vectorStore.memorySearch({
      userId: input.userId,
      query: input.query,
      embedding: queryEmbedding,
      k: 4,
    }),
    getConversationMessages(input.conversationId, 20),
  ]);

  const contextChunks = chunks
    .map(
      (chunk, index) =>
        `[Doc ${index + 1}] ${chunk.text}\n(Source: ${chunk.source.source} | Title: ${chunk.source.title ?? "Untitled"} | URL: ${chunk.source.url ?? "N/A"})`,
    )
    .join("\n\n");

  const memoryContext = memories
    .map((memory, index) => `[Memory ${index + 1}] (${memory.type}) ${memory.content}`)
    .join("\n");

  const prompt = [
    "You are Avatar OS, an AI-generated assistant modeled from the user's data.",
    "Never claim to be the human user. Always be explicit that you are an AI-generated avatar.",
    "Use only retrieved context and memories; if uncertain, ask a clarification question.",
    "Cite relevant sources inline with labels like [Doc 1].",
    input.memoryLearningEnabled
      ? "Learning from conversation is enabled."
      : "Learning from conversation is disabled for this user.",
    `User query:\n${input.query}`,
    `Relevant memories:\n${memoryContext || "None."}`,
    `Relevant knowledge context:\n${contextChunks || "None."}`,
    `Recent conversation:\n${formatMessages(recentMessages) || "No previous messages."}`,
    "Return a concise answer with citations when available.",
  ].join("\n\n");

  const answer = await deps.llm.complete(prompt, { temperature: 0.3 });
  await saveMessage({
    conversationId: input.conversationId,
    role: "assistant",
    content: answer,
  });

  return {
    answer,
    citations: chunks.map((chunk, idx) => ({
      label: `Doc ${idx + 1}`,
      source: `${chunk.source.source}: ${chunk.source.title ?? "Untitled"}`,
      url: chunk.source.url,
    })),
  };
}

export async function streamRagAnswer(
  deps: RagChatDependencies,
  input: {
    userId: string;
    conversationId: string;
    query: string;
    memoryLearningEnabled: boolean;
    onToken: (token: string) => void;
  },
): Promise<ChatResponse> {
  const queryEmbedding = (await deps.embeddings.embed(input.query))[0];
  const [chunks, memories, recentMessages] = await Promise.all([
    deps.vectorStore.similaritySearch({
      userId: input.userId,
      embedding: queryEmbedding,
      k: 6,
    }),
    deps.vectorStore.memorySearch({
      userId: input.userId,
      query: input.query,
      embedding: queryEmbedding,
      k: 4,
    }),
    getConversationMessages(input.conversationId, 20),
  ]);

  const prompt = [
    "You are Avatar OS, an AI-generated assistant modeled from user data.",
    "Do not impersonate the user. Clearly indicate you are AI-generated when relevant.",
    "Prioritize factual consistency with retrieved context and memories.",
    `Query: ${input.query}`,
    `Memories: ${memories.map((m) => `${m.type}: ${m.content}`).join("\n")}`,
    `Knowledge:\n${chunks.map((chunk, idx) => `[Doc ${idx + 1}] ${chunk.text}`).join("\n\n")}`,
    `Conversation:\n${formatMessages(recentMessages)}`,
  ].join("\n\n");

  const answer = await deps.llm.stream(prompt, input.onToken, { temperature: 0.3 });
  await saveMessage({
    conversationId: input.conversationId,
    role: "assistant",
    content: answer,
  });
  return {
    answer,
    citations: chunks.map((chunk, idx) => ({
      label: `Doc ${idx + 1}`,
      source: `${chunk.source.source}: ${chunk.source.title ?? "Untitled"}`,
      url: chunk.source.url,
    })),
  };
}

