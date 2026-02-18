import OpenAI from "openai";

import { getConfig } from "../config";
import type {
  EmbeddingAdapter,
  LlmAdapter,
  TtsAdapter,
  TtsResult,
  VoiceCloneAdapter,
} from "./interfaces";

function buildVisemeTimeline(text: string): TtsResult["visemes"] {
  const visemeMap: Record<string, string> = {
    a: "A",
    e: "E",
    i: "I",
    o: "O",
    u: "U",
  };
  const words = text.split(/\s+/).filter(Boolean);
  const visemes: TtsResult["visemes"] = [];
  let cursor = 0;
  for (const word of words) {
    const firstVowel = word.toLowerCase().split("").find((char) => visemeMap[char]);
    const viseme = firstVowel ? visemeMap[firstVowel] : "M";
    const duration = Math.max(90, word.length * 45);
    visemes.push({
      viseme,
      startMs: cursor,
      endMs: cursor + duration,
    });
    cursor += duration;
  }
  return visemes;
}

class MissingApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingApiKeyError";
  }
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
    const response = await this.client.embeddings.create({
      model: this.modelName,
      input: normalized,
    });
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
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      temperature: options?.temperature ?? 0.2,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0]?.message.content ?? "";
  }

  async stream(
    prompt: string,
    onToken: (token: string) => void,
    options?: { temperature?: number },
  ): Promise<string> {
    const stream = await this.client.chat.completions.create({
      model: this.modelName,
      stream: true,
      temperature: options?.temperature ?? 0.2,
      messages: [{ role: "user", content: prompt }],
    });
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
    const speech = await this.client.audio.speech.create({
      model: this.modelName,
      voice,
      input: input.text,
    });
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
