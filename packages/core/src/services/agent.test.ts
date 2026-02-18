import { describe, expect, it } from "vitest";

import { runAgent } from "./agent";

function createQueuedLlm(outputs: string[]) {
  const queue = [...outputs];
  return {
    modelName: "test-llm",
    complete: async (_prompt: string) => queue.shift() ?? "",
    stream: async (_prompt: string, _onToken: (token: string) => void) => "",
    extractMemories: async (_input: {
      conversation: string;
      existingMemories: Array<{ id: string; type: string; content: string }>;
    }) => [],
  };
}

const embeddingStub = {
  modelName: "test-embed",
  embed: async (_input: string | string[]) => [Array.from({ length: 8 }, () => 0.1)],
};

const vectorStoreStub = {
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
  ) => undefined,
  similaritySearch: async (_input: {
    userId: string;
    embedding: number[];
    k: number;
    filters?: Record<string, unknown>;
  }) => [],
  memorySearch: async (_input: {
    userId: string;
    query: string;
    embedding?: number[];
    k: number;
  }) => [],
};

describe("runAgent", () => {
  it("requires confirmation for create_task", async () => {
    const llm = createQueuedLlm([
      JSON.stringify({
        answerIntent: "Create task",
        toolCalls: [
          {
            toolName: "create_task",
            args: { title: "Ship Avatar OS" },
            reason: "Track work",
          },
        ],
      }),
      "Please confirm task creation.",
    ]);

    const result = await runAgent(
      {
        llm,
        embeddings: embeddingStub,
        vectorStore: vectorStoreStub,
      },
      {
        userId: "user-1",
        query: "Create a task for shipping Avatar OS",
      },
    );

    expect(result.proposedActions).toHaveLength(1);
    expect(result.toolResults[0]?.toolName).toBe("create_task");
    expect(result.toolResults[0]?.output).toBe("Awaiting user confirmation");
  });

  it("supports get_document + summarize by item_id", async () => {
    const llm = createQueuedLlm([
      JSON.stringify({
        answerIntent: "Summarize a specific document",
        toolCalls: [
          {
            toolName: "get_document",
            args: { item_id: "doc-123" },
            reason: "Fetch source",
          },
          {
            toolName: "summarize",
            args: { item_id: "doc-123" },
            reason: "Generate summary",
          },
        ],
      }),
      "- Point one\n- Point two",
      "Here is the summary.",
    ]);

    const result = await runAgent(
      {
        llm,
        embeddings: embeddingStub,
        vectorStore: vectorStoreStub,
        getDocumentById: async () => ({
          id: "doc-123",
          title: "Test Document",
          source: "file_drop",
          url: null,
          text: "This is the source text for summarization.",
          chunkCount: 1,
          metadata: {},
        }),
      },
      {
        userId: "user-1",
        query: "Summarize document doc-123",
      },
    );

    expect(result.toolResults.map((entry) => entry.toolName)).toEqual([
      "get_document",
      "summarize",
    ]);
    expect(result.response).toBe("Here is the summary.");
  });
});
