import { describe, expect, it } from "vitest";

import { runMemoryReflection } from "./memory";

describe("runMemoryReflection", () => {
  it("skips memory extraction when learning is disabled", async () => {
    const result = await runMemoryReflection(
      {
        llm: {
          modelName: "test-llm",
          complete: async (_prompt: string) => {
            throw new Error("should not be called");
          },
          stream: async (_prompt: string, _onToken: (token: string) => void) => {
            throw new Error("should not be called");
          },
          extractMemories: async (_input: {
            conversation: string;
            existingMemories: Array<{ id: string; type: string; content: string }>;
          }) => {
            throw new Error("should not be called");
          },
        },
        embeddings: {
          modelName: "test-embed",
          embed: async (_input: string | string[]) => {
            throw new Error("should not be called");
          },
        },
        vectorStore: {
          upsertChunks: async (
            _chunks: Array<{
              id: string;
              knowledgeItemId: string;
              userId: string;
              chunkIndex: number;
              text: string;
              tokenCount: number;
              embedding: number[];
              metadata: Record<string, unknown>;
              contentHash: string;
            }>,
          ) => {
            throw new Error("should not be called");
          },
          similaritySearch: async (_input: {
            userId: string;
            embedding: number[];
            k: number;
            filters?: Record<string, unknown>;
          }) => {
            throw new Error("should not be called");
          },
          memorySearch: async (_input: {
            userId: string;
            query: string;
            embedding?: number[];
            k: number;
          }) => {
            throw new Error("should not be called");
          },
        },
      },
      {
        userId: "user-1",
        conversationId: "conv-1",
        allowLearningFromConversations: false,
      },
    );
    expect(result).toEqual({ created: 0, updated: 0 });
  });
});
