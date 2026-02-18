import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { encryptJson } from "../crypto";
import type {
  ConnectionRecord,
  Conversation,
  IngestedDocument,
  KnowledgeChunk,
  KnowledgeItem,
  MemoryRecord,
  Message,
  MessageRole,
  ProviderName,
  UserProfile,
} from "../types/domain";

interface MemoryWithEmbedding extends MemoryRecord {
  embedding?: number[];
}

interface AuditLogRecord {
  id: string;
  userId: string;
  action: string;
  objectType: string;
  objectId: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

interface TaskRecord {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  createdAt: Date;
}

interface LiteState {
  users: Map<string, UserProfile>;
  userByEmail: Map<string, string>;
  connections: Map<string, ConnectionRecord>;
  knowledgeItems: Map<string, KnowledgeItem>;
  knowledgeChunks: Map<string, KnowledgeChunk>;
  conversations: Map<string, Conversation>;
  messages: Map<string, Message>;
  memories: Map<string, MemoryWithEmbedding>;
  auditLogs: Map<string, AuditLogRecord>;
  tasks: Map<string, TaskRecord>;
}

declare global {
  // eslint-disable-next-line no-var
  var __avatarLiteRepoState: LiteState | undefined;
}

function now(): Date {
  return new Date();
}

function getState(): LiteState {
  if (!globalThis.__avatarLiteRepoState) {
    globalThis.__avatarLiteRepoState = {
      users: new Map(),
      userByEmail: new Map(),
      connections: new Map(),
      knowledgeItems: new Map(),
      knowledgeChunks: new Map(),
      conversations: new Map(),
      messages: new Map(),
      memories: new Map(),
      auditLogs: new Map(),
      tasks: new Map(),
    };
  }
  return globalThis.__avatarLiteRepoState;
}

function cloneUser(user: UserProfile): UserProfile {
  return {
    ...user,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

function cloneConnection(connection: ConnectionRecord): ConnectionRecord {
  return {
    ...connection,
    scopes: [...connection.scopes],
    metadata: { ...connection.metadata },
    lastSyncedAt: connection.lastSyncedAt ? new Date(connection.lastSyncedAt) : null,
    createdAt: new Date(connection.createdAt),
    updatedAt: new Date(connection.updatedAt),
  };
}

function cloneMessage(message: Message): Message {
  return {
    ...message,
    createdAt: new Date(message.createdAt),
  };
}

function cloneMemory(memory: MemoryWithEmbedding): MemoryRecord {
  return {
    id: memory.id,
    userId: memory.userId,
    type: memory.type,
    content: memory.content,
    confidence: memory.confidence,
    sourceRefs: { ...memory.sourceRefs },
    pinned: memory.pinned,
    createdAt: new Date(memory.createdAt),
    updatedAt: new Date(memory.updatedAt),
    deletedAt: memory.deletedAt ? new Date(memory.deletedAt) : null,
  };
}

function cloneKnowledgeItem(item: KnowledgeItem): KnowledgeItem {
  return {
    ...item,
    createdAt: item.createdAt ? new Date(item.createdAt) : null,
    fetchedAt: new Date(item.fetchedAt),
    rawJson: item.rawJson ? { ...item.rawJson } : null,
    metadata: { ...item.metadata },
    deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
  };
}

function cloneKnowledgeChunk(chunk: KnowledgeChunk): KnowledgeChunk {
  return {
    ...chunk,
    embedding: [...chunk.embedding],
    metadata: { ...chunk.metadata },
    deletedAt: chunk.deletedAt ? new Date(chunk.deletedAt) : null,
  };
}

function getConnectionByUserProvider(
  userId: string,
  provider: ProviderName,
): ConnectionRecord | undefined {
  return [...getState().connections.values()].find(
    (connection) =>
      connection.userId === userId &&
      connection.provider === provider,
  );
}

function pushAuditLog(input: {
  userId: string;
  action: string;
  objectType: string;
  objectId: string;
  details: Record<string, unknown>;
}): void {
  const timestamp = now();
  const entry: AuditLogRecord = {
    id: randomUUID(),
    userId: input.userId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    details: { ...input.details },
    timestamp,
  };
  getState().auditLogs.set(entry.id, entry);
}

export async function ensureUser(input: {
  id?: string;
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<UserProfile> {
  const state = getState();
  const existingId = state.userByEmail.get(input.email);
  const timestamp = now();
  if (existingId) {
    const existing = state.users.get(existingId);
    if (!existing) {
      throw new Error(`Corrupted lite state for email ${input.email}`);
    }
    existing.name = input.name ?? null;
    existing.image = input.image ?? null;
    existing.updatedAt = timestamp;
    state.users.set(existing.id, existing);
    return cloneUser(existing);
  }

  const id = input.id ?? randomUUID();
  const user: UserProfile = {
    id,
    email: input.email,
    name: input.name ?? null,
    image: input.image ?? null,
    shortBio: null,
    styleNotes: null,
    allowLearningFromConversations: true,
    voiceCloneConsent: false,
    voiceCloneProfileId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.users.set(id, user);
  state.userByEmail.set(input.email, id);
  return cloneUser(user);
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const user = getState().users.get(userId);
  if (!user) return null;
  return cloneUser(user);
}

export async function updateUserProfile(input: {
  userId: string;
  shortBio?: string;
  styleNotes?: string;
  allowLearningFromConversations?: boolean;
  voiceCloneConsent?: boolean;
  voiceCloneProfileId?: string | null;
}): Promise<UserProfile> {
  const state = getState();
  const existing = state.users.get(input.userId);
  if (!existing) {
    throw new Error(`User not found: ${input.userId}`);
  }
  existing.shortBio = input.shortBio ?? existing.shortBio;
  existing.styleNotes = input.styleNotes ?? existing.styleNotes;
  existing.allowLearningFromConversations =
    input.allowLearningFromConversations ?? existing.allowLearningFromConversations;
  existing.voiceCloneConsent = input.voiceCloneConsent ?? existing.voiceCloneConsent;
  if (input.voiceCloneProfileId !== undefined && input.voiceCloneProfileId !== null) {
    existing.voiceCloneProfileId = input.voiceCloneProfileId;
  }
  existing.updatedAt = now();
  state.users.set(existing.id, existing);
  return cloneUser(existing);
}

export async function upsertConnection(input: {
  userId: string;
  provider: ProviderName;
  scopes?: string[];
  status?: ConnectionRecord["status"];
  tokens?: Record<string, unknown> | null;
  secrets?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}): Promise<ConnectionRecord> {
  const state = getState();
  const existing = getConnectionByUserProvider(input.userId, input.provider);
  const timestamp = now();
  if (existing) {
    existing.scopes = input.scopes ?? [];
    existing.status = input.status ?? "connected";
    existing.encryptedTokens = input.tokens
      ? encryptJson(input.tokens)
      : existing.encryptedTokens;
    existing.encryptedSecrets = input.secrets
      ? encryptJson(input.secrets)
      : existing.encryptedSecrets;
    existing.metadata = input.metadata ?? {};
    existing.updatedAt = timestamp;
    state.connections.set(existing.id, existing);
    return cloneConnection(existing);
  }

  const record: ConnectionRecord = {
    id: randomUUID(),
    userId: input.userId,
    provider: input.provider,
    status: input.status ?? "connected",
    scopes: input.scopes ?? [],
    encryptedTokens: input.tokens ? encryptJson(input.tokens) : null,
    encryptedSecrets: input.secrets ? encryptJson(input.secrets) : null,
    metadata: input.metadata ?? {},
    lastSyncedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.connections.set(record.id, record);
  return cloneConnection(record);
}

export async function listConnections(userId: string): Promise<ConnectionRecord[]> {
  return [...getState().connections.values()]
    .filter((connection) => connection.userId === userId)
    .sort((a, b) => a.provider.localeCompare(b.provider))
    .map(cloneConnection);
}

export async function getConnectionById(
  connectionId: string,
): Promise<ConnectionRecord | null> {
  const connection = getState().connections.get(connectionId);
  if (!connection) return null;
  return cloneConnection(connection);
}

export async function updateConnectionSyncState(input: {
  connectionId: string;
  status: ConnectionRecord["status"];
}): Promise<void> {
  const connection = getState().connections.get(input.connectionId);
  if (!connection) return;
  connection.status = input.status;
  if (input.status === "connected") {
    connection.lastSyncedAt = now();
  }
  connection.updatedAt = now();
  getState().connections.set(connection.id, connection);
}

export async function disconnectConnection(
  userId: string,
  provider: ProviderName,
): Promise<void> {
  const state = getState();
  const connection = getConnectionByUserProvider(userId, provider);
  if (connection) {
    state.connections.delete(connection.id);
  }
  const deletedAt = now();
  for (const item of state.knowledgeItems.values()) {
    if (item.userId !== userId || item.source !== provider) continue;
    item.deletedAt = deletedAt;
    state.knowledgeItems.set(item.id, item);
  }
  for (const chunk of state.knowledgeChunks.values()) {
    if (chunk.userId !== userId) continue;
    const item = state.knowledgeItems.get(chunk.knowledgeItemId);
    if (!item || item.source !== provider) continue;
    chunk.deletedAt = deletedAt;
    state.knowledgeChunks.set(chunk.id, chunk);
  }
  if (connection) {
    pushAuditLog({
      userId,
      action: "connection.deleted",
      objectType: "connection",
      objectId: connection.id,
      details: { provider },
    });
  }
}

export async function createKnowledgeItem(input: {
  userId: string;
  source: ProviderName;
  sourceId?: string | null;
  url?: string | null;
  title?: string | null;
  author?: string | null;
  createdAt?: Date | null;
  rawText?: string | null;
  rawJson?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  contentHash: string;
}): Promise<{ id: string; changed: boolean }> {
  const state = getState();
  const sourceId = input.sourceId ?? null;
  const existing = [...state.knowledgeItems.values()].find(
    (item) =>
      item.userId === input.userId &&
      item.source === input.source &&
      item.sourceId === sourceId,
  );
  if (!existing) {
    const item: KnowledgeItem = {
      id: randomUUID(),
      userId: input.userId,
      source: input.source,
      sourceId,
      url: input.url ?? null,
      title: input.title ?? null,
      author: input.author ?? null,
      createdAt: input.createdAt ?? null,
      fetchedAt: now(),
      rawText: input.rawText ?? null,
      rawJson: input.rawJson ?? null,
      metadata: input.metadata ?? {},
      contentHash: input.contentHash,
      deletedAt: null,
    };
    state.knowledgeItems.set(item.id, item);
    return { id: item.id, changed: true };
  }
  if (existing.contentHash === input.contentHash) {
    return { id: existing.id, changed: false };
  }
  existing.url = input.url ?? null;
  existing.title = input.title ?? null;
  existing.author = input.author ?? null;
  existing.createdAt = input.createdAt ?? null;
  existing.fetchedAt = now();
  existing.rawText = input.rawText ?? null;
  existing.rawJson = input.rawJson ?? null;
  existing.metadata = input.metadata ?? {};
  existing.contentHash = input.contentHash;
  existing.deletedAt = null;
  state.knowledgeItems.set(existing.id, existing);
  return { id: existing.id, changed: true };
}

export async function softDeleteKnowledgeItem(input: {
  userId: string;
  knowledgeItemId: string;
}): Promise<void> {
  const state = getState();
  const item = state.knowledgeItems.get(input.knowledgeItemId);
  if (!item || item.userId !== input.userId) return;
  const deletedAt = now();
  item.deletedAt = deletedAt;
  state.knowledgeItems.set(item.id, item);
  for (const chunk of state.knowledgeChunks.values()) {
    if (
      chunk.userId === input.userId &&
      chunk.knowledgeItemId === input.knowledgeItemId
    ) {
      chunk.deletedAt = deletedAt;
      state.knowledgeChunks.set(chunk.id, chunk);
    }
  }
  pushAuditLog({
    userId: input.userId,
    action: "knowledge_item.deleted",
    objectType: "knowledge_item",
    objectId: input.knowledgeItemId,
    details: {},
  });
}

export async function listKnowledgeItems(userId: string): Promise<
  Array<{
    id: string;
    source: ProviderName;
    title: string | null;
    fetchedAt: Date;
    deletedAt: Date | null;
    metadata: Record<string, unknown>;
  }>
> {
  return [...getState().knowledgeItems.values()]
    .filter((item) => item.userId === userId)
    .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime())
    .map((item) => ({
      id: item.id,
      source: item.source,
      title: item.title,
      fetchedAt: new Date(item.fetchedAt),
      deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
      metadata: { ...item.metadata },
    }));
}

export async function getKnowledgeItemById(input: {
  userId: string;
  knowledgeItemId: string;
}): Promise<
  | {
      id: string;
      source: ProviderName;
      sourceId: string;
      metadata: Record<string, unknown>;
      rawJson: Record<string, unknown> | null;
      deletedAt: Date | null;
    }
  | null
> {
  const item = getState().knowledgeItems.get(input.knowledgeItemId);
  if (!item || item.userId !== input.userId) return null;
  return {
    id: item.id,
    source: item.source,
    sourceId: item.sourceId ?? "",
    metadata: { ...item.metadata },
    rawJson: item.rawJson ? { ...item.rawJson } : null,
    deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
  };
}

export async function updateKnowledgeItemRawText(input: {
  userId: string;
  knowledgeItemId: string;
  rawText: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const state = getState();
  const item = state.knowledgeItems.get(input.knowledgeItemId);
  if (!item || item.userId !== input.userId) return;
  item.rawText = input.rawText;
  item.metadata = input.metadata ?? item.metadata;
  item.fetchedAt = now();
  item.deletedAt = null;
  state.knowledgeItems.set(item.id, item);
}

export async function getKnowledgeDocument(input: {
  userId: string;
  knowledgeItemId: string;
}): Promise<
  | {
      id: string;
      title: string | null;
      source: ProviderName;
      url: string | null;
      text: string;
      chunkCount: number;
      metadata: Record<string, unknown>;
    }
  | null
> {
  const state = getState();
  const item = state.knowledgeItems.get(input.knowledgeItemId);
  if (!item || item.userId !== input.userId || item.deletedAt) return null;
  const chunks = [...state.knowledgeChunks.values()]
    .filter(
      (chunk) =>
        chunk.userId === input.userId &&
        chunk.knowledgeItemId === input.knowledgeItemId &&
        !chunk.deletedAt,
    )
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

  const mergedText = item.rawText ?? chunks.map((chunk) => chunk.text).join("\n\n").trim();
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    url: item.url,
    text: mergedText,
    chunkCount: chunks.length,
    metadata: { ...item.metadata },
  };
}

export async function upsertDocumentBatch(documents: IngestedDocument[]): Promise<
  Array<{
    itemId: string;
    changed: boolean;
    userId: string;
  }>
> {
  const results: Array<{ itemId: string; changed: boolean; userId: string }> = [];
  for (const document of documents) {
    const created = await createKnowledgeItem({
      userId: document.userId,
      source: document.source,
      sourceId: document.sourceId ?? document.itemId,
      url: document.url,
      title: document.title,
      author: document.author,
      createdAt: document.createdAt ?? null,
      rawText: document.rawText ?? null,
      rawJson: document.rawJson ?? null,
      metadata: document.metadata ?? {},
      contentHash: String(document.metadata?.contentHash ?? ""),
    });
    results.push({
      itemId: created.id,
      changed: created.changed,
      userId: document.userId,
    });
  }
  return results;
}

export async function upsertKnowledgeChunks(
  chunks: Array<{
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
): Promise<void> {
  const state = getState();
  for (const chunk of chunks) {
    const existing = [...state.knowledgeChunks.values()].find(
      (entry) =>
        entry.knowledgeItemId === chunk.knowledgeItemId &&
        entry.chunkIndex === chunk.chunkIndex,
    );
    if (existing) {
      existing.text = chunk.text;
      existing.tokenCount = chunk.tokenCount;
      existing.embedding = [...chunk.embedding];
      existing.metadata = { ...chunk.metadata };
      existing.contentHash = chunk.contentHash;
      existing.deletedAt = null;
      state.knowledgeChunks.set(existing.id, existing);
      continue;
    }
    state.knowledgeChunks.set(chunk.id, {
      id: chunk.id,
      knowledgeItemId: chunk.knowledgeItemId,
      userId: chunk.userId,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      embedding: [...chunk.embedding],
      metadata: { ...chunk.metadata },
      contentHash: chunk.contentHash,
      deletedAt: null,
    });
  }
}

export function listKnowledgeChunksForUser(userId: string): Array<{
  chunk: KnowledgeChunk;
  item: KnowledgeItem;
}> {
  const state = getState();
  const rows: Array<{ chunk: KnowledgeChunk; item: KnowledgeItem }> = [];
  for (const chunk of state.knowledgeChunks.values()) {
    if (chunk.userId !== userId || chunk.deletedAt) continue;
    const item = state.knowledgeItems.get(chunk.knowledgeItemId);
    if (!item || item.deletedAt) continue;
    rows.push({
      chunk: cloneKnowledgeChunk(chunk),
      item: cloneKnowledgeItem(item),
    });
  }
  return rows;
}

export function listMemoriesWithEmbeddings(userId: string): MemoryWithEmbedding[] {
  return [...getState().memories.values()]
    .filter((memory) => memory.userId === userId && !memory.deletedAt)
    .map((memory) => ({
      ...memory,
      sourceRefs: { ...memory.sourceRefs },
      embedding: memory.embedding ? [...memory.embedding] : undefined,
      createdAt: new Date(memory.createdAt),
      updatedAt: new Date(memory.updatedAt),
      deletedAt: memory.deletedAt ? new Date(memory.deletedAt) : null,
    }));
}

export async function createConversation(input: {
  userId: string;
  title?: string;
}): Promise<{ id: string }> {
  const id = randomUUID();
  const timestamp = now();
  getState().conversations.set(id, {
    id,
    userId: input.userId,
    title: input.title ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return { id };
}

export async function listConversations(userId: string): Promise<
  Array<{ id: string; title: string | null; createdAt: Date; updatedAt: Date }>
> {
  return [...getState().conversations.values()]
    .filter((conversation) => conversation.userId === userId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: new Date(conversation.createdAt),
      updatedAt: new Date(conversation.updatedAt),
    }));
}

export async function getConversationById(input: {
  userId: string;
  conversationId: string;
}): Promise<{ id: string; userId: string; title: string | null } | null> {
  const conversation = getState().conversations.get(input.conversationId);
  if (!conversation || conversation.userId !== input.userId) return null;
  return {
    id: conversation.id,
    userId: conversation.userId,
    title: conversation.title,
  };
}

export async function saveMessage(input: {
  conversationId: string;
  role: MessageRole;
  content: string;
}): Promise<Message> {
  const message: Message = {
    id: randomUUID(),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    createdAt: now(),
  };
  const state = getState();
  state.messages.set(message.id, message);
  const conversation = state.conversations.get(input.conversationId);
  if (conversation) {
    conversation.updatedAt = now();
    state.conversations.set(conversation.id, conversation);
  }
  return cloneMessage(message);
}

export async function getConversationMessages(
  conversationId: string,
  limit = 20,
): Promise<Message[]> {
  return [...getState().messages.values()]
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .reverse()
    .map(cloneMessage);
}

export async function listMemories(userId: string): Promise<MemoryRecord[]> {
  return [...getState().memories.values()]
    .filter((memory) => memory.userId === userId && !memory.deletedAt)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    })
    .map(cloneMemory);
}

export async function upsertMemory(input: {
  userId: string;
  memoryId?: string;
  type: MemoryRecord["type"];
  content: string;
  confidence: number;
  sourceRefs: Record<string, unknown>;
  pinned?: boolean;
  embedding?: number[];
}): Promise<MemoryRecord> {
  const state = getState();
  if (input.memoryId) {
    const existing = state.memories.get(input.memoryId);
    if (existing && existing.userId === input.userId) {
      existing.type = input.type;
      existing.content = input.content;
      existing.confidence = input.confidence;
      existing.sourceRefs = { ...input.sourceRefs };
      existing.pinned = input.pinned ?? existing.pinned;
      existing.embedding = input.embedding ? [...input.embedding] : existing.embedding;
      existing.updatedAt = now();
      existing.deletedAt = null;
      state.memories.set(existing.id, existing);
      return cloneMemory(existing);
    }
  }

  const id = randomUUID();
  const timestamp = now();
  const created: MemoryWithEmbedding = {
    id,
    userId: input.userId,
    type: input.type,
    content: input.content,
    confidence: input.confidence,
    sourceRefs: { ...input.sourceRefs },
    pinned: input.pinned ?? false,
    embedding: input.embedding ? [...input.embedding] : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
  state.memories.set(created.id, created);
  return cloneMemory(created);
}

export async function deleteMemory(input: {
  userId: string;
  memoryId: string;
}): Promise<void> {
  const state = getState();
  const memory = state.memories.get(input.memoryId);
  if (!memory || memory.userId !== input.userId) return;
  memory.deletedAt = now();
  memory.updatedAt = now();
  state.memories.set(memory.id, memory);
}

export async function appendAuditLog(
  _client: PoolClient | null,
  input: {
    userId: string;
    action: string;
    objectType: string;
    objectId: string;
    details: Record<string, unknown>;
  },
): Promise<void> {
  pushAuditLog(input);
}

export async function listAuditLogs(userId: string): Promise<
  Array<{
    id: string;
    action: string;
    objectType: string;
    objectId: string;
    details: Record<string, unknown>;
    timestamp: Date;
  }>
> {
  return [...getState().auditLogs.values()]
    .filter((log) => log.userId === userId)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 500)
    .map((log) => ({
      id: log.id,
      action: log.action,
      objectType: log.objectType,
      objectId: log.objectId,
      details: { ...log.details },
      timestamp: new Date(log.timestamp),
    }));
}

export async function createTask(input: {
  userId: string;
  title: string;
  notes?: string;
}): Promise<{ id: string; title: string; notes: string | null; createdAt: Date }> {
  const task: TaskRecord = {
    id: randomUUID(),
    userId: input.userId,
    title: input.title,
    notes: input.notes ?? null,
    createdAt: now(),
  };
  getState().tasks.set(task.id, task);
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    createdAt: new Date(task.createdAt),
  };
}

export async function listTasks(userId: string): Promise<
  Array<{ id: string; title: string; notes: string | null; createdAt: Date }>
> {
  return [...getState().tasks.values()]
    .filter((task) => task.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((task) => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      createdAt: new Date(task.createdAt),
    }));
}

export async function getBasicAnalytics(userId: string): Promise<{
  knowledgeItemCount: number;
  chunkCount: number;
  memoryCount: number;
  conversationCount: number;
  messageCount: number;
}> {
  const state = getState();
  const knowledgeItemCount = [...state.knowledgeItems.values()].filter(
    (item) => item.userId === userId && !item.deletedAt,
  ).length;
  const chunkCount = [...state.knowledgeChunks.values()].filter(
    (chunk) => chunk.userId === userId && !chunk.deletedAt,
  ).length;
  const memoryCount = [...state.memories.values()].filter(
    (memory) => memory.userId === userId && !memory.deletedAt,
  ).length;
  const conversationIds = new Set(
    [...state.conversations.values()]
      .filter((conversation) => conversation.userId === userId)
      .map((conversation) => conversation.id),
  );
  const conversationCount = conversationIds.size;
  const messageCount = [...state.messages.values()].filter((message) =>
    conversationIds.has(message.conversationId),
  ).length;
  return {
    knowledgeItemCount,
    chunkCount,
    memoryCount,
    conversationCount,
    messageCount,
  };
}

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const state = getState();
  const user = state.users.get(userId);
  const connections = [...state.connections.values()].filter(
    (connection) => connection.userId === userId,
  );
  const knowledgeItems = [...state.knowledgeItems.values()].filter(
    (item) => item.userId === userId && !item.deletedAt,
  );
  const chunks = [...state.knowledgeChunks.values()].filter(
    (chunk) => chunk.userId === userId && !chunk.deletedAt,
  );
  const memories = [...state.memories.values()].filter(
    (memory) => memory.userId === userId && !memory.deletedAt,
  );
  const conversations = [...state.conversations.values()].filter(
    (conversation) => conversation.userId === userId,
  );
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  const messages = [...state.messages.values()].filter((message) =>
    conversationIds.has(message.conversationId),
  );
  const logs = [...state.auditLogs.values()].filter((log) => log.userId === userId);
  return {
    user: user ? cloneUser(user) : null,
    connections: connections.map(cloneConnection),
    knowledgeItems: knowledgeItems.map(cloneKnowledgeItem),
    chunks: chunks.map(cloneKnowledgeChunk),
    memories: memories.map(cloneMemory),
    conversations: conversations.map((conversation) => ({
      ...conversation,
      createdAt: new Date(conversation.createdAt),
      updatedAt: new Date(conversation.updatedAt),
    })),
    messages: messages.map(cloneMessage),
    logs: logs.map((log) => ({
      ...log,
      details: { ...log.details },
      timestamp: new Date(log.timestamp),
    })),
  };
}

export async function hardDeleteUserData(userId: string): Promise<void> {
  const state = getState();
  const email = [...state.userByEmail.entries()].find((entry) => entry[1] === userId)?.[0];
  if (email) {
    state.userByEmail.delete(email);
  }
  state.users.delete(userId);

  const conversationIds = new Set<string>();
  for (const conversation of state.conversations.values()) {
    if (conversation.userId === userId) {
      conversationIds.add(conversation.id);
      state.conversations.delete(conversation.id);
    }
  }

  for (const [id, message] of state.messages.entries()) {
    if (conversationIds.has(message.conversationId)) {
      state.messages.delete(id);
    }
  }

  for (const [id, connection] of state.connections.entries()) {
    if (connection.userId === userId) {
      state.connections.delete(id);
    }
  }
  for (const [id, item] of state.knowledgeItems.entries()) {
    if (item.userId === userId) {
      state.knowledgeItems.delete(id);
    }
  }
  for (const [id, chunk] of state.knowledgeChunks.entries()) {
    if (chunk.userId === userId) {
      state.knowledgeChunks.delete(id);
    }
  }
  for (const [id, memory] of state.memories.entries()) {
    if (memory.userId === userId) {
      state.memories.delete(id);
    }
  }
  for (const [id, task] of state.tasks.entries()) {
    if (task.userId === userId) {
      state.tasks.delete(id);
    }
  }
  for (const [id, log] of state.auditLogs.entries()) {
    if (log.userId === userId) {
      state.auditLogs.delete(id);
    }
  }
}
