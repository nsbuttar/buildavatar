import { sha256Hex } from "../crypto";
import type { ChunkingResult } from "../types/domain";

function estimateTokenCount(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

function splitSections(text: string): Array<{ heading?: string; content: string }> {
  const lines = text.split(/\r?\n/);
  const sections: Array<{ heading?: string; content: string }> = [];
  let heading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content) {
      sections.push({ heading, content });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*#{1,6}\s+/.test(line)) {
      flush();
      heading = line.replace(/^\s*#{1,6}\s+/, "").trim();
      continue;
    }
    if (/^\s*$/.test(line) && buffer.length > 0) {
      buffer.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();
  if (sections.length === 0) {
    return [{ content: text }];
  }
  return sections;
}

export function chunkText(input: {
  text: string;
  metadata: Record<string, unknown>;
  chunkSizeTokens?: number;
  overlapTokens?: number;
}): ChunkingResult[] {
  const chunkSizeTokens = input.chunkSizeTokens ?? 1000;
  const overlapTokens = input.overlapTokens ?? 150;
  const sections = splitSections(input.text);
  const chunks: ChunkingResult[] = [];

  for (const section of sections) {
    const words = section.content.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let start = 0;
    while (start < words.length) {
      let tokenBudget = 0;
      const selected: string[] = [];
      let idx = start;
      while (idx < words.length && tokenBudget < chunkSizeTokens) {
        const word = words[idx];
        selected.push(word);
        tokenBudget += estimateTokenCount(word);
        idx += 1;
      }
      const text = selected.join(" ").trim();
      if (!text) break;
      chunks.push({
        text,
        tokenCount: estimateTokenCount(text),
        metadata: {
          ...input.metadata,
          sectionHeading: section.heading,
        },
        contentHash: sha256Hex(text),
      });
      if (idx >= words.length) break;
      const overlapWordCount = Math.max(1, Math.floor(overlapTokens / 1.3));
      start = Math.max(start + 1, idx - overlapWordCount);
    }
  }

  return chunks;
}

