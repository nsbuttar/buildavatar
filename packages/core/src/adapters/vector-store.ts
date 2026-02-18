import type { PoolClient } from "pg";

import { query, toPgVector, withTransaction } from "../db";
import {
  listKnowledgeChunksForUser,
  listMemoriesWithEmbeddings,
  upsertKnowledgeChunks,
} from "../services/repositories-lite";
import type { MemoryRecord, RetrievedChunk, RetrievedMemory } from "../types/domain";
import type { VectorStoreAdapter } from "./interfaces";

function buildMetadataFilterSql(
  filters: Record<string, unknown> | undefined,
  params: unknown[],
): string {
  if (!filters || Object.keys(filters).length === 0) {
    return "";
  }
  const segments: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    params.push(value);
    segments.push(`kc.metadata ->> '${key}' = $${params.length}`);
  }
  return segments.length > 0 ? ` AND ${segments.join(" AND ")}` : "";
}

async function insertChunk(
  client: PoolClient,
  chunk: {
    id: string;
    knowledgeItemId: string;
    userId: string;
    chunkIndex: number;
    text: string;
    tokenCount: number;
    embedding: number[];
    metadata: Record<string, unknown>;
    contentHash: string;
  },
): Promise<void> {
  await client.query(
    `
    INSERT INTO knowledge_chunks (
      id, knowledge_item_id, user_id, chunk_index, text, token_count,
      embedding, metadata, content_hash
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7::vector,$8,$9)
    ON CONFLICT (knowledge_item_id, chunk_index) DO UPDATE
    SET
      text = EXCLUDED.text,
      token_count = EXCLUDED.token_count,
      embedding = EXCLUDED.embedding,
      metadata = EXCLUDED.metadata,
      content_hash = EXCLUDED.content_hash,
      deleted_at = NULL
    `,
    [
      chunk.id,
      chunk.knowledgeItemId,
      chunk.userId,
      chunk.chunkIndex,
      chunk.text,
      chunk.tokenCount,
      toPgVector(chunk.embedding),
      chunk.metadata,
      chunk.contentHash,
    ],
  );
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (!aNorm || !bNorm) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export class PgVectorStoreAdapter implements VectorStoreAdapter {
  async upsertChunks(
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
    await withTransaction(async (client) => {
      for (const chunk of chunks) {
        await insertChunk(client, chunk);
      }
    });
  }

  async similaritySearch(input: {
    userId: string;
    embedding: number[];
    k: number;
    filters?: Record<string, unknown>;
  }): Promise<RetrievedChunk[]> {
    const params: unknown[] = [input.userId, toPgVector(input.embedding), input.k];
    const metadataFilter = buildMetadataFilterSql(input.filters, params);
    const rows = await query<{
      chunk_id: string;
      knowledge_item_id: string;
      score: number;
      text: string;
      metadata: Record<string, unknown>;
      title: string | null;
      url: string | null;
      source: string;
    }>(
      `
      SELECT
        kc.id AS chunk_id,
        kc.knowledge_item_id,
        1 - (kc.embedding <=> $2::vector) AS score,
        kc.text,
        kc.metadata,
        ki.title,
        ki.url,
        ki.source
      FROM knowledge_chunks kc
      JOIN knowledge_items ki ON ki.id = kc.knowledge_item_id
      WHERE kc.user_id = $1
        AND kc.deleted_at IS NULL
        AND ki.deleted_at IS NULL
        ${metadataFilter}
      ORDER BY kc.embedding <=> $2::vector
      LIMIT $3
      `,
      params,
    );
    return rows.map((row) => ({
      chunkId: row.chunk_id,
      knowledgeItemId: row.knowledge_item_id,
      score: row.score,
      text: row.text,
      metadata: row.metadata ?? {},
      source: {
        title: row.title,
        url: row.url,
        source: row.source as RetrievedChunk["source"]["source"],
      },
    }));
  }

  async memorySearch(input: {
    userId: string;
    query: string;
    embedding?: number[];
    k: number;
  }): Promise<RetrievedMemory[]> {
    if (input.embedding && input.embedding.length > 0) {
      const rows = await query<{
        id: string;
        type: MemoryRecord["type"];
        content: string;
        confidence: number;
        pinned: boolean;
        score: number;
      }>(
        `
        SELECT
          id,
          type,
          content,
          confidence,
          pinned,
          1 - (embedding <=> $2::vector) AS score
        FROM memories
        WHERE user_id = $1
          AND deleted_at IS NULL
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT $3
        `,
        [input.userId, toPgVector(input.embedding), input.k],
      );
      return rows;
    }
    const rows = await query<{
      id: string;
      type: MemoryRecord["type"];
      content: string;
      confidence: number;
      pinned: boolean;
    }>(
      `
      SELECT id, type, content, confidence, pinned
      FROM memories
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND content ILIKE $2
      ORDER BY pinned DESC, updated_at DESC
      LIMIT $3
      `,
      [input.userId, `%${input.query}%`, input.k],
    );
    return rows;
  }
}

export class LiteVectorStoreAdapter implements VectorStoreAdapter {
  async upsertChunks(
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
    await upsertKnowledgeChunks(chunks);
  }

  async similaritySearch(input: {
    userId: string;
    embedding: number[];
    k: number;
    filters?: Record<string, unknown>;
  }): Promise<RetrievedChunk[]> {
    const rows = listKnowledgeChunksForUser(input.userId)
      .filter(({ chunk }) => {
        if (!input.filters || Object.keys(input.filters).length === 0) return true;
        return Object.entries(input.filters).every(([key, value]) => {
          const metadataValue = chunk.metadata[key];
          return String(metadataValue ?? "") === String(value ?? "");
        });
      })
      .map(({ chunk, item }) => ({
        chunkId: chunk.id,
        knowledgeItemId: chunk.knowledgeItemId,
        score: cosineSimilarity(chunk.embedding, input.embedding),
        text: chunk.text,
        metadata: chunk.metadata,
        source: {
          title: item.title,
          url: item.url,
          source: item.source,
        },
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, input.k);
    return rows;
  }

  async memorySearch(input: {
    userId: string;
    query: string;
    embedding?: number[];
    k: number;
  }): Promise<RetrievedMemory[]> {
    const memories = listMemoriesWithEmbeddings(input.userId);
    if (input.embedding && input.embedding.length > 0) {
      return memories
        .filter((memory) => memory.embedding && memory.embedding.length > 0)
        .map((memory) => ({
          id: memory.id,
          type: memory.type,
          content: memory.content,
          confidence: memory.confidence,
          pinned: memory.pinned,
          score: cosineSimilarity(memory.embedding ?? [], input.embedding ?? []),
        }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, input.k);
    }
    const normalizedQuery = input.query.toLowerCase();
    return memories
      .filter((memory) => memory.content.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .slice(0, input.k)
      .map((memory) => ({
        id: memory.id,
        type: memory.type as MemoryRecord["type"],
        content: memory.content,
        confidence: memory.confidence,
        pinned: memory.pinned,
      }));
  }
}

export class DisabledQdrantAdapter implements VectorStoreAdapter {
  async upsertChunks(): Promise<void> {
    throw new Error("Qdrant adapter not configured in this build");
  }

  async similaritySearch(): Promise<RetrievedChunk[]> {
    throw new Error("Qdrant adapter not configured in this build");
  }

  async memorySearch(): Promise<RetrievedMemory[]> {
    throw new Error("Qdrant adapter not configured in this build");
  }
}

