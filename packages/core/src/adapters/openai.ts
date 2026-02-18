import OpenAI from "openai";

import { getConfig } from "../config";
import {
  getErrorRetryAfterMs,
  getErrorStatus,
  isLikelyTransientError,
  retryAsync,
} from "../services/retry";
import type {
  EmbeddingAdapter,
  LlmAdapter,
  TtsAdapter,
  TtsResult,
  VoiceCloneAdapter,
} from "./interfaces";

function buildVisemeTimeline(text: string): TtsResult["visemes"] {
  const punctuationPauseMs: Record<string, number> = {
    ",": 90,
    ";": 120,
    ":": 120,
    ".": 170,
    "!": 190,
    "?": 190,
  };

  const digraphMap: Array<{ pattern: string; viseme: string; durationMs: number }> = [
    { pattern: "tion", viseme: "I", durationMs: 90 },
    { pattern: "sh", viseme: "I", durationMs: 84 },
    { pattern: "ch", viseme: "I", durationMs: 84 },
    { pattern: "th", viseme: "E", durationMs: 78 },
    { pattern: "ph", viseme: "E", durationMs: 76 },
    { pattern: "wh", viseme: "U", durationMs: 76 },
    { pattern: "oo", viseme: "U", durationMs: 92 },
    { pattern: "ee", viseme: "E", durationMs: 88 },
    { pattern: "ea", viseme: "E", durationMs: 84 },
    { pattern: "ou", viseme: "O", durationMs: 86 },
    { pattern: "ow", viseme: "O", durationMs: 86 },
    { pattern: "ai", viseme: "A", durationMs: 88 },
    { pattern: "ay", viseme: "A", durationMs: 88 },
    { pattern: "oi", viseme: "O", durationMs: 86 },
    { pattern: "oy", viseme: "O", durationMs: 86 },
  ];

  const charMap: Record<string, { viseme: string; durationMs: number }> = {
    a: { viseme: "A", durationMs: 84 },
    e: { viseme: "E", durationMs: 80 },
    i: { viseme: "I", durationMs: 80 },
    o: { viseme: "O", durationMs: 86 },
    u: { viseme: "U", durationMs: 88 },
    y: { viseme: "I", durationMs: 74 },
    b: { viseme: "M", durationMs: 62 },
    p: { viseme: "M", durationMs: 62 },
    m: { viseme: "M", durationMs: 68 },
    f: { viseme: "E", durationMs: 72 },
    v: { viseme: "E", durationMs: 72 },
    s: { viseme: "E", durationMs: 72 },
    z: { viseme: "E", durationMs: 72 },
    c: { viseme: "E", durationMs: 70 },
    t: { viseme: "I", durationMs: 68 },
    d: { viseme: "I", durationMs: 68 },
    n: { viseme: "I", durationMs: 70 },
    l: { viseme: "I", durationMs: 72 },
    r: { viseme: "I", durationMs: 72 },
    w: { viseme: "U", durationMs: 76 },
    q: { viseme: "U", durationMs: 76 },
    g: { viseme: "O", durationMs: 70 },
    k: { viseme: "O", durationMs: 70 },
    h: { viseme: "A", durationMs: 66 },
    j: { viseme: "I", durationMs: 74 },
    x: { viseme: "E", durationMs: 74 },
  };

  const tokens = text.match(/[A-Za-z']+|[0-9]+|[.,!?;:]/g) ?? [];
  const visemes: TtsResult["visemes"] = [];
  let cursor = 0;

  const pushCue = (viseme: string, durationMs: number) => {
    const duration = Math.max(28, Math.floor(durationMs));
    const last = visemes[visemes.length - 1];
    if (last && last.viseme === viseme && last.endMs >= cursor) {
      last.endMs += duration;
    } else {
      visemes.push({
        viseme,
        startMs: cursor,
        endMs: cursor + duration,
      });
    }
    cursor += duration;
  };

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    const pause = punctuationPauseMs[token];
    if (pause) {
      pushCue("M", pause);
      continue;
    }

    let idx = 0;
    const lower = token.toLowerCase();
    while (idx < lower.length) {
      let matched = false;
      for (const rule of digraphMap) {
        if (lower.startsWith(rule.pattern, idx)) {
          pushCue(rule.viseme, rule.durationMs);
          idx += rule.pattern.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      const char = lower[idx];
      const mapping = charMap[char];
      if (mapping) {
        pushCue(mapping.viseme, mapping.durationMs);
      } else {
        const isDigit = char >= "0" && char <= "9";
        pushCue("M", isDigit ? 62 : 48);
      }
      idx += 1;
    }

    if (tokenIndex < tokens.length - 1) {
      pushCue("M", 34);
    }
  }

  if (!visemes.length) {
    pushCue("M", 100);
  }

  return visemes;
}

class MissingApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingApiKeyError";
  }
}

const OPENAI_RETRY_OPTIONS = {
  attempts: 4,
  minDelayMs: 500,
  maxDelayMs: 12_000,
  jitter: 0.1,
} as const;

function shouldRetryOpenAiError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 408 || status === 409 || status === 425 || status === 429) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }
  return isLikelyTransientError(error);
}

export class OpenAiEmbeddingAdapter implements EmbeddingAdapter {
  readonly modelName: string;
  private readonly client: OpenAI;

  constructor(modelName = getConfig().OPENAI_EMBED_MODEL) {
    const apiKey = getConfig().OPENAI_API_KEY;
    if (!apiKey) throw new MissingApiKeyError("OPENAI_API_KEY is required for embeddings");
    this.client = new OpenAI({ apiKey });
    this.modelName = modelName;
  }

  async embed(input: string | string[]): Promise<number[][]> {
    const normalized = Array.isArray(input) ? input : [input];
    const response = await retryAsync(
      async () =>
        this.client.embeddings.create({
          model: this.modelName,
          input: normalized,
        }),
      {
        ...OPENAI_RETRY_OPTIONS,
        shouldRetry: shouldRetryOpenAiError,
        retryAfterMs: getErrorRetryAfterMs,
      },
    );
    return response.data.map((entry) => entry.embedding);
  }
}

export class OpenAiLlmAdapter implements LlmAdapter {
  readonly modelName: string;
  private readonly client: OpenAI;

  constructor(modelName = getConfig().OPENAI_CHAT_MODEL) {
    const apiKey = getConfig().OPENAI_API_KEY;
    if (!apiKey) throw new MissingApiKeyError("OPENAI_API_KEY is required for chat");
    this.client = new OpenAI({ apiKey });
    this.modelName = modelName;
  }

  async complete(prompt: string, options?: { temperature?: number }): Promise<string> {
    const response = await retryAsync(
      async () =>
        this.client.chat.completions.create({
          model: this.modelName,
          temperature: options?.temperature ?? 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      {
        ...OPENAI_RETRY_OPTIONS,
        shouldRetry: shouldRetryOpenAiError,
        retryAfterMs: getErrorRetryAfterMs,
      },
    );
    return response.choices[0]?.message.content ?? "";
  }

  async stream(
    prompt: string,
    onToken: (token: string) => void,
    options?: { temperature?: number },
  ): Promise<string> {
    const stream = await retryAsync(
      async () =>
        this.client.chat.completions.create({
          model: this.modelName,
          stream: true,
          temperature: options?.temperature ?? 0.2,
          messages: [{ role: "user", content: prompt }],
        }),
      {
        ...OPENAI_RETRY_OPTIONS,
        shouldRetry: shouldRetryOpenAiError,
        retryAfterMs: getErrorRetryAfterMs,
      },
    );
    let acc = "";
    for await (const part of stream) {
      const token = part.choices[0]?.delta?.content ?? "";
      if (!token) continue;
      acc += token;
      onToken(token);
    }
    return acc;
  }

  async extractMemories(input: {
    conversation: string;
    existingMemories: Array<{ id: string; type: string; content: string }>;
  }): Promise<
    Array<{
      type: "fact" | "preference" | "project" | "person";
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
        type: "fact" | "preference" | "project" | "person";
        content: string;
        confidence: number;
        shouldUpdateId?: string;
      }>;
    } catch {
      return [];
    }
  }
}

export class OpenAiTtsAdapter implements TtsAdapter {
  private readonly client: OpenAI;
  private readonly modelName: string;

  constructor(modelName = getConfig().OPENAI_TTS_MODEL) {
    const apiKey = getConfig().OPENAI_API_KEY;
    if (!apiKey) throw new MissingApiKeyError("OPENAI_API_KEY is required for TTS");
    this.client = new OpenAI({ apiKey });
    this.modelName = modelName;
  }

  async synthesize(input: {
    text: string;
    consentGranted: boolean;
    voiceCloneProfileId?: string;
    fallbackVoice: string;
  }): Promise<TtsResult> {
    const voice = input.consentGranted
      ? input.voiceCloneProfileId || input.fallbackVoice
      : "alloy";
    const speech = await retryAsync(
      async () =>
        this.client.audio.speech.create({
          model: this.modelName,
          voice,
          input: input.text,
        }),
      {
        ...OPENAI_RETRY_OPTIONS,
        shouldRetry: shouldRetryOpenAiError,
        retryAfterMs: getErrorRetryAfterMs,
      },
    );
    const buffer = Buffer.from(await speech.arrayBuffer());
    return {
      mimeType: "audio/mpeg",
      audioBuffer: buffer,
      visemes: buildVisemeTimeline(input.text),
      usedVoice: voice,
    };
  }
}

export class DisabledVoiceCloneAdapter implements VoiceCloneAdapter {
  async createProfile(): Promise<{ profileId: string }> {
    throw new Error("Voice cloning adapter is not configured");
  }
}

export class MockEmbeddingAdapter implements EmbeddingAdapter {
  readonly modelName = "mock-embeddings";

  async embed(input: string | string[]): Promise<number[][]> {
    const normalized = Array.isArray(input) ? input : [input];
    return normalized.map((text) => {
      const seed = text.length || 1;
      return Array.from({ length: 1536 }, (_, idx) => ((seed * (idx + 13)) % 97) / 100);
    });
  }
}

export class MockLlmAdapter implements LlmAdapter {
  readonly modelName = "mock-llm";

  async complete(prompt: string): Promise<string> {
    return `Mock response generated for: ${prompt.slice(0, 140)}`;
  }

  async stream(prompt: string, onToken: (token: string) => void): Promise<string> {
    const output = await this.complete(prompt);
    output.split(" ").forEach((token) => onToken(`${token} `));
    return output;
  }

  async extractMemories(): Promise<
    Array<{
      type: "fact" | "preference" | "project" | "person";
      content: string;
      confidence: number;
      shouldUpdateId?: string;
    }>
  > {
    return [];
  }
}

export class MockTtsAdapter implements TtsAdapter {
  async synthesize(input: {
    text: string;
    consentGranted: boolean;
    voiceCloneProfileId?: string;
    fallbackVoice: string;
  }): Promise<TtsResult> {
    return {
      mimeType: "audio/mpeg",
      audioBuffer: Buffer.from(""),
      visemes: buildVisemeTimeline(input.text),
      usedVoice: input.consentGranted ? input.voiceCloneProfileId ?? input.fallbackVoice : "alloy",
    };
  }
}
