import { getConfig, isLiteRuntime } from "./config";
import {
  MockEmbeddingAdapter,
  MockLlmAdapter,
  MockTtsAdapter,
  OpenAiEmbeddingAdapter,
  OpenAiLlmAdapter,
  OpenAiTtsAdapter,
} from "./adapters/openai";
import { LocalStorageAdapter, S3StorageAdapter } from "./adapters/storage";
import { LiteVectorStoreAdapter, PgVectorStoreAdapter } from "./adapters/vector-store";
import type {
  EmbeddingAdapter,
  LlmAdapter,
  StorageAdapter,
  TtsAdapter,
  VectorStoreAdapter,
} from "./adapters/interfaces";

let llm: LlmAdapter | null = null;
let embeddings: EmbeddingAdapter | null = null;
let vectorStore: VectorStoreAdapter | null = null;
let storage: StorageAdapter | null = null;
let tts: TtsAdapter | null = null;

export function getLlmAdapter(): LlmAdapter {
  if (llm) return llm;
  try {
    llm = new OpenAiLlmAdapter();
  } catch {
    llm = new MockLlmAdapter();
  }
  return llm;
}

export function getEmbeddingAdapter(): EmbeddingAdapter {
  if (embeddings) return embeddings;
  try {
    embeddings = new OpenAiEmbeddingAdapter();
  } catch {
    embeddings = new MockEmbeddingAdapter();
  }
  return embeddings;
}

export function getVectorStoreAdapter(): VectorStoreAdapter {
  if (vectorStore) return vectorStore;
  vectorStore = isLiteRuntime()
    ? new LiteVectorStoreAdapter()
    : new PgVectorStoreAdapter();
  return vectorStore;
}

export function getStorageAdapter(): StorageAdapter {
  if (storage) return storage;
  const config = getConfig();
  if (
    config.S3_BUCKET &&
    config.S3_ACCESS_KEY_ID &&
    config.S3_SECRET_ACCESS_KEY
  ) {
    storage = new S3StorageAdapter();
    return storage;
  }
  storage = new LocalStorageAdapter();
  return storage;
}

export function getTtsAdapter(): TtsAdapter {
  if (tts) return tts;
  try {
    tts = new OpenAiTtsAdapter();
  } catch {
    tts = new MockTtsAdapter();
  }
  return tts;
}

