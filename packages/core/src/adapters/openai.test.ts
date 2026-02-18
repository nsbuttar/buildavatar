import { describe, expect, it } from "vitest";

import { MockEmbeddingAdapter, MockTtsAdapter } from "./openai";

describe("mock adapters", () => {
  it("returns fixed-size embeddings", async () => {
    const adapter = new MockEmbeddingAdapter();
    const embeddings = await adapter.embed(["one", "two"]);
    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]).toHaveLength(1536);
  });

  it("generates visemes for synthesized speech", async () => {
    const adapter = new MockTtsAdapter();
    const result = await adapter.synthesize({
      text: "hello avatar",
      consentGranted: false,
      fallbackVoice: "alloy",
    });
    expect(result.visemes.length).toBeGreaterThan(0);
    expect(result.usedVoice).toBe("alloy");
  });
});

