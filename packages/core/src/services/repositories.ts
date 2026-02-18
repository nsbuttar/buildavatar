import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { encryptJson } from "../crypto";
import { query, withTransaction } from "../db";
import type {
  ConnectionRecord,
  IngestedDocument,
  MemoryRecord,
  Message,
  MessageRole,
  ProviderName,
  UserProfile,
} from "../types/domain";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  short_bio: string | null;
  style_notes: string | null;
  allow_learning_from_conversations: boolean;
  voice_clone_consent: boolean;
  voice_clone_profile_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    shortBio: row.short_bio,
    styleNotes: row.style_notes,
    allowLearningFromConversations: row.allow_learning_from_conversations,
    voiceCloneConsent: row.voice_clone_consent,
    voiceCloneProfileId: row.voice_clone_profile_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureUser(input: {
  id?: string;
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<UserProfile> {
  const userId = input.id ?? randomUUID();
  const rows = await query<UserRow>(
    `
    INSERT INTO users (id, email, name, image)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        image = EXCLUDED.image,
        updated_at = NOW()
    RETURNING *
    `,
    [userId, input.email, input.name ?? null, input.image ?? null],
  );
  return mapUser(rows[0]);
}

export async function getUserById(userId: string): Promise<UserProfile | null> {
  const rows = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) return null;
  return mapUser(rows[0]);
}

export async function updateUserProfile(input: {
  userId: string;
  shortBio?: string;
  styleNotes?: string;
  allowLearningFromConversations?: boolean;
  voiceCloneConsent?: boolean;
  voiceCloneProfileId?: string | null;
}): Promise<UserProfile> {
  const rows = await query<UserRow>(
    `
    UPDATE users
    SET
      short_bio = COALESCE($2, short_bio),
      style_notes = COALESCE($3, style_notes),
      allow_learning_from_conversations = COALESCE($4, allow_learning_from_conversations),
      voice_clone_consent = COALESCE($5, voice_clone_consent),
      voice_clone_profile_id = CASE WHEN $6 IS NULL THEN voice_clone_profile_id ELSE $6 END,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      input.userId,
      input.shortBio ?? null,
      input.styleNotes ?? null,
      input.allowLearningFromConversations ?? null,
      input.voiceCloneConsent ?? null,
      input.voiceCloneProfileId === undefined ? null : input.voiceCloneProfileId,
    ],
  );
  if (!rows[0]) {
    throw new Error(`User not found: ${input.userId}`);
  }
  return mapUser(rows[0]);
}

interface ConnectionRow {
  id: string;
  user_id: string;
  provider: ProviderName;
  status: ConnectionRecord["status"];
  scopes: string[];
  encrypted_tokens: string | null;
  encrypted_secrets: string | null;
  metadata: Record<string, unknown>;
  last_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapConnection(row: ConnectionRow): ConnectionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    status: row.status,
    scopes: row.scopes ?? [],
    encryptedTokens: row.encrypted_tokens,
    encryptedSecrets: row.encrypted_secrets,
    metadata: row.metadata ?? {},
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  const rows = await query<ConnectionRow>(
    `
    INSERT INTO connections (
      id, user_id, provider, scopes, status,
      encrypted_tokens, encrypted_secrets, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id, provider) DO UPDATE
    SET
      scopes = EXCLUDED.scopes,
      status = EXCLUDED.status,
      encrypted_tokens = COALESCE(EXCLUDED.encrypted_tokens, connections.encrypted_tokens),
      encrypted_secrets = COALESCE(EXCLUDED.encrypted_secrets, connections.encrypted_secrets),
      metadata = COALESCE(EXCLUDED.metadata, connections.metadata),
      updated_at = NOW()
    RETURNING *
    `,
    [
      randomUUID(),
      input.userId,
      input.provider,
      input.scopes ?? [],
      input.status ?? "connected",
      input.tokens ? encryptJson(input.tokens) : null,
      input.secrets ? encryptJson(input.secrets) : null,
      input.metadata ?? {},
    ],
  );
  return mapConnection(rows[0]);
}

export async function listConnections(userId: string): Promise<ConnectionRecord[]> {
  const rows = await query<ConnectionRow>(
    `SELECT * FROM connections WHERE user_id = $1 ORDER BY provider`,
    [userId],
  );
  return rows.map(mapConnection);
}

export async function getConnectionById(
  connectionId: string,
): Promise<ConnectionRecord | null> {
  const rows = await query<ConnectionRow>(`SELECT * FROM connections WHERE id = $1`, [
    connectionId,
  ]);
  if (!rows[0]) return null;
  return mapConnection(rows[0]);
}

export async function updateConnectionSyncState(input: {
  connectionId: string;
  status: ConnectionRecord["status"];
}): Promise<void> {
  await query(
    `
    UPDATE connections
    SET status = $2,
        last_synced_at = CASE WHEN $2 = 'connected' THEN NOW() ELSE last_synced_at END,
        updated_at = NOW()
    WHERE id = $1
    `,
    [input.connectionId, input.status],
  );
}

export async function disconnectConnection(
  userId: string,
  provider: ProviderName,
): Promise<void> {
  await withTransaction(async (client) => {
    const connectionRows = await client.query<{ id: string }>(
      `SELECT id FROM connections WHERE user_id = $1 AND provider = $2`,
      [userId, provider],
    );
    const connectionId = connectionRows.rows[0]?.id;
    if (connectionId) {
      await client.query(
        `DELETE FROM connections WHERE user_id = $1 AND provider = $2`,
        [userId, provider],
      );
    }
    await client.query(
      `
      UPDATE knowledge_items
      SET deleted_at = NOW()
      WHERE user_id = $1 AND source = $2
      `,
      [userId, provider],
    );
    await client.query(
      `
      UPDATE knowledge_chunks
      SET deleted_at = NOW()
      WHERE user_id = $1
        AND knowledge_item_id IN (
          SELECT id FROM knowledge_items WHERE user_id = $1 AND source = $2
        )
      `,
      [userId, provider],
    );
    if (connectionId) {
      await appendAuditLog(client, {
        userId,
        action: "connection.deleted",
        objectType: "connection",
        objectId: connectionId,
        details: { provider },
      });
    }
  });
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
  const id = randomUUID();
  const rows = await query<{ id: string; content_hash: string }>(
    `
    INSERT INTO knowledge_items (
      id, user_id, source, source_id, url, title, author,
      created_at, fetched_at, raw_text, raw_json, metadata, content_hash
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12)
    ON CONFLICT (user_id, source, source_id) DO UPDATE
    SET
      url = EXCLUDED.url,
      title = EXCLUDED.title,
      author = EXCLUDED.author,
      created_at = EXCLUDED.created_at,
      fetched_at = NOW(),
      raw_text = EXCLUDED.raw_text,
      raw_json = EXCLUDED.raw_json,
      metadata = EXCLUDED.metadata,
      deleted_at = NULL
    WHERE knowledge_items.content_hash <> EXCLUDED.content_hash
    RETURNING id, content_hash
    `,
    [
      id,
      input.userId,
      input.source,
      input.sourceId ?? null,
      input.url ?? null,
      input.title ?? null,
      input.author ?? null,
      input.createdAt ?? null,
      input.rawText ?? null,
      input.rawJson ?? null,
      input.metadata ?? {},
      input.contentHash,
    ],
  );
  if (!rows[0]) {
    const existing = await query<{ id: string }>(
      `
      SELECT id FROM knowledge_items
      WHERE user_id = $1 AND source = $2 AND source_id = $3
      `,
      [input.userId, input.source, input.sourceId ?? null],
    );
    return { id: existing[0].id, changed: false };
  }
  return { id: rows[0].id, changed: true };
}

export async function softDeleteKnowledgeItem(input: {
  userId: string;
  knowledgeItemId: string;
}): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE knowledge_items
      SET deleted_at = NOW()
      WHERE id = $1 AND user_id = $2
      `,
      [input.knowledgeItemId, input.userId],
    );
    await client.query(
      `
      UPDATE knowledge_chunks
      SET deleted_at = NOW()
      WHERE knowledge_item_id = $1 AND user_id = $2
      `,
      [input.knowledgeItemId, input.userId],
    );
    await appendAuditLog(client, {
      userId: input.userId,
      action: "knowledge_item.deleted",
      objectType: "knowledge_item",
      objectId: input.knowledgeItemId,
      details: {},
    });
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
  return query(
    `
    SELECT id, source, title, fetched_at AS "fetchedAt", deleted_at AS "deletedAt", metadata
    FROM knowledge_items
    WHERE user_id = $1
    ORDER BY fetched_at DESC
    `,
    [userId],
  );
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
  const rows = await query<{
    id: string;
    source: ProviderName;
    source_id: string;
    metadata: Record<string, unknown>;
    raw_json: Record<string, unknown> | null;
    deleted_at: Date | null;
  }>(
    `
    SELECT id, source, source_id, metadata, raw_json, deleted_at
    FROM knowledge_items
    WHERE id = $1 AND user_id = $2
    `,
    [input.knowledgeItemId, input.userId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    source: rows[0].source,
    sourceId: rows[0].source_id,
    metadata: rows[0].metadata ?? {},
    rawJson: rows[0].raw_json,
    deletedAt: rows[0].deleted_at,
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
      contentHash: document.metadata?.contentHash as string,
    });
    results.push({
      itemId: created.id,
      changed: created.changed,
      userId: document.userId,
    });
  }
  return results;
}

export async function createConversation(input: {
  userId: string;
  title?: string;
}): Promise<{ id: string }> {
  const rows = await query<{ id: string }>(
    `
    INSERT INTO conversations (id, user_id, title)
    VALUES ($1,$2,$3)
    RETURNING id
    `,
    [randomUUID(), input.userId, input.title ?? null],
  );
  return { id: rows[0].id };
}

export async function listConversations(userId: string): Promise<
  Array<{ id: string; title: string | null; createdAt: Date; updatedAt: Date }>
> {
  return query(
    `
    SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM conversations
    WHERE user_id = $1
    ORDER BY updated_at DESC
    `,
    [userId],
  );
}

export async function getConversationById(input: {
  userId: string;
  conversationId: string;
}): Promise<{ id: string; userId: string; title: string | null } | null> {
  const rows = await query<{ id: string; user_id: string; title: string | null }>(
    `
    SELECT id, user_id, title
    FROM conversations
    WHERE id = $1 AND user_id = $2
    `,
    [input.conversationId, input.userId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    userId: rows[0].user_id,
    title: rows[0].title,
  };
}

export async function saveMessage(input: {
  conversationId: string;
  role: MessageRole;
  content: string;
}): Promise<Message> {
  const rows = await query<{
    id: string;
    conversation_id: string;
    role: MessageRole;
    content: string;
    created_at: Date;
  }>(
    `
    INSERT INTO messages (id, conversation_id, role, content)
    VALUES ($1,$2,$3,$4)
    RETURNING *
    `,
    [randomUUID(), input.conversationId, input.role, input.content],
  );
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [
    input.conversationId,
  ]);
  return {
    id: rows[0].id,
    conversationId: rows[0].conversation_id,
    role: rows[0].role,
    content: rows[0].content,
    createdAt: rows[0].created_at,
  };
}

export async function getConversationMessages(
  conversationId: string,
  limit = 20,
): Promise<Message[]> {
  const rows = await query<{
    id: string;
    conversation_id: string;
    role: MessageRole;
    content: string;
    created_at: Date;
  }>(
    `
    SELECT * FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [conversationId, limit],
  );
  return rows.reverse().map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export async function listMemories(userId: string): Promise<MemoryRecord[]> {
  const rows = await query<{
    id: string;
    user_id: string;
    type: MemoryRecord["type"];
    content: string;
    confidence: number;
    source_refs: Record<string, unknown>;
    pinned: boolean;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `
    SELECT *
    FROM memories
    WHERE user_id = $1
      AND deleted_at IS NULL
    ORDER BY pinned DESC, updated_at DESC
    `,
    [userId],
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    type: row.type,
    content: row.content,
    confidence: row.confidence,
    sourceRefs: row.source_refs ?? {},
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));
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
  if (input.memoryId) {
    const updated = await query<{
      id: string;
      user_id: string;
      type: MemoryRecord["type"];
      content: string;
      confidence: number;
      source_refs: Record<string, unknown>;
      pinned: boolean;
      created_at: Date;
      updated_at: Date;
      deleted_at: Date | null;
    }>(
      `
      UPDATE memories
      SET
        type = $3,
        content = $4,
        confidence = $5,
        source_refs = $6,
        pinned = COALESCE($7, pinned),
        embedding = COALESCE($8::vector, embedding),
        updated_at = NOW(),
        deleted_at = NULL
      WHERE id = $1 AND user_id = $2
      RETURNING *
      `,
      [
        input.memoryId,
        input.userId,
        input.type,
        input.content,
        input.confidence,
        input.sourceRefs,
        input.pinned ?? null,
        input.embedding ? `[${input.embedding.join(",")}]` : null,
      ],
    );
    if (updated[0]) {
      return {
        id: updated[0].id,
        userId: updated[0].user_id,
        type: updated[0].type,
        content: updated[0].content,
        confidence: updated[0].confidence,
        sourceRefs: updated[0].source_refs ?? {},
        pinned: updated[0].pinned,
        createdAt: updated[0].created_at,
        updatedAt: updated[0].updated_at,
        deletedAt: updated[0].deleted_at,
      };
    }
  }

  const inserted = await query<{
    id: string;
    user_id: string;
    type: MemoryRecord["type"];
    content: string;
    confidence: number;
    source_refs: Record<string, unknown>;
    pinned: boolean;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `
    INSERT INTO memories (
      id, user_id, type, content, confidence, source_refs, pinned, embedding
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector)
    RETURNING *
    `,
    [
      randomUUID(),
      input.userId,
      input.type,
      input.content,
      input.confidence,
      input.sourceRefs,
      input.pinned ?? false,
      input.embedding ? `[${input.embedding.join(",")}]` : null,
    ],
  );
  return {
    id: inserted[0].id,
    userId: inserted[0].user_id,
    type: inserted[0].type,
    content: inserted[0].content,
    confidence: inserted[0].confidence,
    sourceRefs: inserted[0].source_refs ?? {},
    pinned: inserted[0].pinned,
    createdAt: inserted[0].created_at,
    updatedAt: inserted[0].updated_at,
    deletedAt: inserted[0].deleted_at,
  };
}

export async function deleteMemory(input: {
  userId: string;
  memoryId: string;
}): Promise<void> {
  await query(
    `
    UPDATE memories
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    `,
    [input.memoryId, input.userId],
  );
}

export async function appendAuditLog(
  client: PoolClient | null,
  input: {
    userId: string;
    action: string;
    objectType: string;
    objectId: string;
    details: Record<string, unknown>;
  },
): Promise<void> {
  const runner = client ?? {
    query: (text: string, params: unknown[]) => query(text, params),
  };
  await runner.query(
    `
    INSERT INTO audit_logs (id, user_id, action, object_type, object_id, details)
    VALUES ($1,$2,$3,$4,$5,$6)
    `,
    [randomUUID(), input.userId, input.action, input.objectType, input.objectId, input.details],
  );
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
  return query(
    `
    SELECT
      id,
      action,
      object_type AS "objectType",
      object_id AS "objectId",
      details,
      timestamp
    FROM audit_logs
    WHERE user_id = $1
    ORDER BY timestamp DESC
    LIMIT 500
    `,
    [userId],
  );
}

export async function createTask(input: {
  userId: string;
  title: string;
  notes?: string;
}): Promise<{ id: string; title: string; notes: string | null; createdAt: Date }> {
  const rows = await query<{ id: string; title: string; notes: string | null; created_at: Date }>(
    `
    INSERT INTO tasks (id, user_id, title, notes)
    VALUES ($1,$2,$3,$4)
    RETURNING id, title, notes, created_at
    `,
    [randomUUID(), input.userId, input.title, input.notes ?? null],
  );
  return {
    id: rows[0].id,
    title: rows[0].title,
    notes: rows[0].notes,
    createdAt: rows[0].created_at,
  };
}

export async function listTasks(userId: string): Promise<
  Array<{ id: string; title: string; notes: string | null; createdAt: Date }>
> {
  return query(
    `
    SELECT id, title, notes, created_at AS "createdAt"
    FROM tasks
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId],
  );
}

export async function getBasicAnalytics(userId: string): Promise<{
  knowledgeItemCount: number;
  chunkCount: number;
  memoryCount: number;
  conversationCount: number;
  messageCount: number;
}> {
  const [knowledgeItem] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM knowledge_items WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const [chunk] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM knowledge_chunks WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const [memory] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM memories WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const [conversation] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM conversations WHERE user_id = $1`,
    [userId],
  );
  const [message] = await query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM messages
    WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)
    `,
    [userId],
  );
  return {
    knowledgeItemCount: Number(knowledgeItem?.count ?? 0),
    chunkCount: Number(chunk?.count ?? 0),
    memoryCount: Number(memory?.count ?? 0),
    conversationCount: Number(conversation?.count ?? 0),
    messageCount: Number(message?.count ?? 0),
  };
}

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const [user] = await query(`SELECT * FROM users WHERE id = $1`, [userId]);
  const connections = await query(`SELECT * FROM connections WHERE user_id = $1`, [userId]);
  const knowledgeItems = await query(
    `SELECT * FROM knowledge_items WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const chunks = await query(
    `SELECT * FROM knowledge_chunks WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const memories = await query(
    `SELECT * FROM memories WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const conversations = await query(`SELECT * FROM conversations WHERE user_id = $1`, [userId]);
  const messages = await query(
    `
    SELECT m.*
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1
    `,
    [userId],
  );
  const logs = await query(`SELECT * FROM audit_logs WHERE user_id = $1`, [userId]);
  return {
    user,
    connections,
    knowledgeItems,
    chunks,
    memories,
    conversations,
    messages,
    logs,
  };
}

export async function hardDeleteUserData(userId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM audit_logs WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM tasks WHERE user_id = $1`, [userId]);
    await client.query(
      `
      DELETE FROM messages
      WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = $1)
      `,
      [userId],
    );
    await client.query(`DELETE FROM conversations WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM memories WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM knowledge_chunks WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM knowledge_items WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM connections WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });
}
