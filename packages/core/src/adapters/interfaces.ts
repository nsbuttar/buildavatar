import type {
  ChatResponse,
  ChunkingResult,
  ConnectorSyncResult,
  IngestedDocument,
  MemoryRecord,
  RetrievedChunk,
  RetrievedMemory,
} from "../types/domain";

export interface EmbeddingAdapter {
  modelName: string;
  embed(input: string | string[]): Promise<number[][]>;
}

export interface LlmAdapter {
  modelName: string;
  complete(prompt: string, options?: { temperature?: number }): Promise<string>;
  stream(
    prompt: string,
    onToken: (token: string) => void,
    options?: { temperature?: number },
  ): Promise<string>;
  extractMemories(input: {
    conversation: string;
    existingMemories: Pick<MemoryRecord, "id" | "type" | "content">[];
  }): Promise<
    Array<{
      type: MemoryRecord["type"];
      content: string;
      confidence: number;
      shouldUpdateId?: string;
    }>
  >;
}

export interface VectorStoreAdapter {
  upsertChunks(chunks: Array<ChunkingResult & { id: string; knowledgeItemId: string; userId: string }>): Promise<void>;
  similaritySearch(input: {
    userId: string;
    embedding: number[];
    k: number;
    filters?: Record<string, unknown>;
  }): Promise<RetrievedChunk[]>;
  memorySearch(input: {
    userId: string;
    query: string;
    embedding?: number[];
    k: number;
  }): Promise<RetrievedMemory[]>;
}

export interface StorageObject {
  key: string;
  contentType: string;
  bytes: Buffer;
}

export interface StorageAdapter {
  putObject(input: {
    key: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<string>;
  getObject(key: string): Promise<StorageObject>;
  deleteObject(key: string): Promise<void>;
}

export interface TtsResult {
  mimeType: string;
  audioBuffer: Buffer;
  visemes: Array<{
    viseme: string;
    startMs: number;
    endMs: number;
  }>;
  usedVoice: string;
}

export interface TtsAdapter {
  synthesize(input: {
    text: string;
    consentGranted: boolean;
    voiceCloneProfileId?: string;
    fallbackVoice: string;
  }): Promise<TtsResult>;
}

export interface VoiceCloneAdapter {
  createProfile(input: {
    userId: string;
    displayName: string;
    sampleBuffers: Buffer[];
    consentGranted: boolean;
  }): Promise<{ profileId: string }>;
}

export interface ConnectorAdapter {
  provider: string;
  sync(input: {
    userId: string;
    connectionId: string;
    cursor?: string;
  }): Promise<ConnectorSyncResult & { documents?: IngestedDocument[] }>;
  toDocuments(input: {
    userId: string;
    payload: Record<string, unknown>;
  }): Promise<IngestedDocument[]>;
}

export interface ChatOrchestrator {
  answer(input: {
    userId: string;
    conversationId: string;
    query: string;
    enableAgentMode?: boolean;
    confirmedActions?: string[];
  }): Promise<ChatResponse>;
}
