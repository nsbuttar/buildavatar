import { describe, expect, it } from "vitest";

import { chunkText } from "./chunker";

describe("chunkText", () => {
  it("creates overlapping chunks with metadata", () => {
    const text = Array.from({ length: 600 }, (_, index) => `token-${index}`).join(" ");
    const chunks = chunkText({
      text,
      metadata: { filename: "sample.txt" },
      chunkSizeTokens: 120,
      overlapTokens: 30,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].metadata.filename).toBe("sample.txt");
    expect(chunks.every((chunk) => chunk.text.length > 0)).toBe(true);
    expect(chunks.every((chunk) => chunk.contentHash.length === 64)).toBe(true);
  });
});

