import type { MemoryRecord } from "../types/domain";
import {
  getErrorRetryAfterMs,
  getErrorStatus,
  isLikelyTransientError,
  retryAsync,
} from "../services/retry";
import type { LlmAdapter } from "./interfaces";

class MissingApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingApiKeyError";
  }
}

interface GeminiLlmOptions {
  apiKey: string;
  modelName?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

const DEFAULT_GEMINI_CHAT_MODEL = "gemini-2.0-flash";

const GEMINI_RETRY_OPTIONS = {
  attempts: 4,
  minDelayMs: 500,
  maxDelayMs: 12_000,
  jitter: 0.1,
} as const;

interface HttpErrorShape extends Error {
  status?: number;
}

function shouldRetryGeminiError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }
  return isLikelyTransientError(error);
}

function parseMemoryExtractionResponse(raw: string): Array<{
  type: MemoryRecord["type"];
  content: string;
  confidence: number;
  shouldUpdateId?: string;
}> {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.content === "string")
      .map((entry) => ({
        type: entry.type,
        content: String(entry.content).trim(),
        confidence: Number(entry.confidence ?? 0.5),
        shouldUpdateId:
          typeof entry.shouldUpdateId === "string" ? entry.shouldUpdateId : undefined,
      }))
      .filter((entry) =>
        ["fact", "preference", "project", "person"].includes(entry.type),
      ) as Array<{
      type: MemoryRecord["type"];
      content: string;
      confidence: number;
      shouldUpdateId?: string;
    }>;
  } catch {
    return [];
  }
}

function extractTextFromGeminiResponse(payload: GeminiGenerateContentResponse): string {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("") ?? ""
  );
}

export class GeminiLlmAdapter implements LlmAdapter {
  readonly modelName: string;
  private readonly apiKey: string;

  constructor(options: GeminiLlmOptions) {
    if (!options.apiKey) {
      throw new MissingApiKeyError("GEMINI_API_KEY is required for Gemini chat");
    }
    this.apiKey = options.apiKey;
    this.modelName = options.modelName ?? DEFAULT_GEMINI_CHAT_MODEL;
  }

  async complete(prompt: string, options?: { temperature?: number }): Promise<string> {
    const payload = await retryAsync(
      async () => {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            this.modelName,
          )}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                temperature: options?.temperature ?? 0.2,
              },
            }),
          },
        );
        if (!response.ok) {
          const body = await response.text();
          const error = new Error(
            `Gemini request failed (${response.status}): ${body.slice(0, 300)}`,
          ) as HttpErrorShape;
          error.status = response.status;
          throw error;
        }
        return (await response.json()) as GeminiGenerateContentResponse;
      },
      {
        ...GEMINI_RETRY_OPTIONS,
        shouldRetry: shouldRetryGeminiError,
        retryAfterMs: getErrorRetryAfterMs,
      },
    );
    return extractTextFromGeminiResponse(payload);
  }

  async stream(
    prompt: string,
    onToken: (token: string) => void,
    options?: { temperature?: number },
  ): Promise<string> {
    const output = await this.complete(prompt, options);
    output.split(" ").forEach((token) => {
      if (!token) return;
      onToken(`${token} `);
    });
    return output;
  }

  async extractMemories(input: {
    conversation: string;
    existingMemories: Pick<MemoryRecord, "id" | "type" | "content">[];
  }): Promise<
    Array<{
      type: MemoryRecord["type"];
      content: string;
      confidence: number;
      shouldUpdateId?: string;
    }>
  > {
    const prompt = [
      "Extract durable user memories from this conversation.",
      "Return strict JSON array where each item has: type, content, confidence (0-1), shouldUpdateId (optional).",
      "Allowed types: fact, preference, project, person.",
      "Avoid transient details and avoid sensitive content unless explicitly useful.",
      `Existing memories: ${JSON.stringify(input.existingMemories)}`,
      `Conversation:\n${input.conversation}`,
    ].join("\n\n");

    const raw = await this.complete(prompt, { temperature: 0.1 });
    return parseMemoryExtractionResponse(raw);
  }
}
