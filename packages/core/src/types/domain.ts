export type ProviderName =
  | "github"
  | "youtube"
  | "x"
  | "file_drop"
  | "gmail"
  | "calendar";

export type ConnectionStatus = "connected" | "disconnected" | "error" | "pending";

export type MemoryType = "fact" | "preference" | "project" | "person";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  styleNotes: string | null;
  shortBio: string | null;
  allowLearningFromConversations: boolean;
  voiceCloneConsent: boolean;
  voiceCloneProfileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectionRecord {
  id: string;
  userId: string;
  provider: ProviderName;
  status: ConnectionStatus;
  scopes: string[];
  encryptedTokens: string | null;
  encryptedSecrets: string | null;
  metadata: Record<string, unknown>;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeItem {
  id: string;
  userId: string;
  source: ProviderName;
  sourceId: string | null;
  url: string | null;
  title: string | null;
  author: string | null;
  createdAt: Date | null;
  fetchedAt: Date;
  rawText: string | null;
  rawJson: Record<string, unknown> | null;
  contentHash: string;
  metadata: Record<string, unknown>;
  deletedAt: Date | null;
}

export interface KnowledgeChunk {
  id: string;
  knowledgeItemId: string;
  userId: string;
  chunkIndex: number;
  text: string;
  tokenCount: number;
  embedding: number[];
  metadata: Record<string, unknown>;
  contentHash: string;
  deletedAt: Date | null;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface MemoryRecord {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  confidence: number;
  sourceRefs: Record<string, unknown>;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RetrievedChunk {
  chunkId: string;
  knowledgeItemId: string;
  score: number;
  text: string;
  metadata: Record<string, unknown>;
  source: {
    title: string | null;
    url: string | null;
    source: ProviderName;
  };
}

export interface RetrievedMemory {
  id: string;
  type: MemoryType;
  content: string;
  confidence: number;
  pinned: boolean;
  score?: number;
}

export interface Citation {
  label: string;
  source: string;
  url?: string | null;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  toolCalls?: ToolCallResult[];
}

export interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | string;
}

export interface IngestedDocument {
  itemId: string;
  userId: string;
  source: ProviderName;
  sourceId?: string;
  url?: string;
  title?: string;
  author?: string;
  createdAt?: Date;
  rawText?: string;
  rawJson?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ChunkMetadata {
  filename?: string;
  page?: number;
  sectionHeading?: string;
  source?: string;
  url?: string;
  [key: string]: unknown;
}

export interface ChunkingResult {
  text: string;
  tokenCount: number;
  metadata: ChunkMetadata;
  contentHash: string;
}

export interface ConnectorSyncResult {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}
