import { randomUUID } from "node:crypto";

import type {
  ConnectorAdapter,
  EmbeddingAdapter,
  StorageAdapter,
  VectorStoreAdapter,
} from "../adapters/interfaces";
import { sha256Hex } from "../crypto";
import { logger } from "../logger";
import { chunkText } from "./chunker";
import { parseDocumentBuffer } from "./parser";
import type { ProviderName } from "../types/domain";
import {
  appendAuditLog,
  createKnowledgeItem,
  getConnectionById,
  listConnections,
  updateKnowledgeItemRawText,
  upsertDocumentBatch,
} from "./repositories";

export class IngestionService {
  constructor(
    private readonly embeddingAdapter: EmbeddingAdapter,
    private readonly vectorStore: VectorStoreAdapter,
    private readonly storageAdapter: StorageAdapter,
  ) {}

  async ingestFile(input: {
    userId: string;
    knowledgeItemId: string;
    objectKey: string;
    fileName: string;
    mimeType: string;
  }): Promise<{ chunks: number }> {
    const object = await this.storageAdapter.getObject(input.objectKey);
    const parsed = await parseDocumentBuffer({
      bytes: object.bytes,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });
    const chunks = chunkText({
      text: parsed.text,
      metadata: {
        filename: input.fileName,
      },
      chunkSizeTokens: 1000,
      overlapTokens: 150,
    });
    if (chunks.length === 0) {
      return { chunks: 0 };
    }
    await updateKnowledgeItemRawText({
      userId: input.userId,
      knowledgeItemId: input.knowledgeItemId,
      rawText: parsed.text,
      metadata: {
        filename: input.fileName,
        parser: parsed.metadata,
      },
    });

    const embeddings = await this.embeddingAdapter.embed(chunks.map((chunk) => chunk.text));
    await this.vectorStore.upsertChunks(
      chunks.map((chunk, index) => ({
        ...chunk,
        id: randomUUID(),
        knowledgeItemId: input.knowledgeItemId,
        userId: input.userId,
        chunkIndex: index,
        embedding: embeddings[index],
      })),
    );

    await appendAuditLog(null, {
      userId: input.userId,
      action: "file.ingested",
      objectType: "knowledge_item",
      objectId: input.knowledgeItemId,
      details: {
        objectKey: input.objectKey,
        chunkCount: chunks.length,
      },
    });
    return { chunks: chunks.length };
  }

  async ingestNormalizedDocument(input: {
    userId: string;
    source: ProviderName;
    sourceId: string;
    title?: string;
    url?: string;
    author?: string;
    rawText: string;
    rawJson?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<{ changed: boolean; itemId: string; chunks: number }> {
    const contentHash = sha256Hex(input.rawText);
    const { id, changed } = await createKnowledgeItem({
      userId: input.userId,
      source: input.source,
      sourceId: input.sourceId,
      title: input.title,
      url: input.url,
      author: input.author,
      rawText: input.rawText,
      rawJson: input.rawJson ?? null,
      metadata: {
        ...(input.metadata ?? {}),
      },
      contentHash,
    });
    if (!changed) {
      return { changed: false, itemId: id, chunks: 0 };
    }
    const chunks = chunkText({
      text: input.rawText,
      metadata: input.metadata ?? {},
      chunkSizeTokens: 900,
      overlapTokens: 120,
    });
    const embeddings = await this.embeddingAdapter.embed(chunks.map((chunk) => chunk.text));
    await this.vectorStore.upsertChunks(
      chunks.map((chunk, idx) => ({
        ...chunk,
        id: randomUUID(),
        knowledgeItemId: id,
        userId: input.userId,
        chunkIndex: idx,
        embedding: embeddings[idx],
      })),
    );
    await appendAuditLog(null, {
      userId: input.userId,
      action: "source.ingested",
      objectType: "knowledge_item",
      objectId: id,
      details: {
        source: input.source,
        sourceId: input.sourceId,
        chunkCount: chunks.length,
      },
    });
    return { changed: true, itemId: id, chunks: chunks.length };
  }

  async syncConnection(input: {
    userId: string;
    connectionId: string;
    connector: ConnectorAdapter;
  }): Promise<void> {
    const connection = await getConnectionById(input.connectionId);
    if (!connection || connection.userId !== input.userId) {
      throw new Error("Connection not found");
    }
    const result = await input.connector.sync({
      userId: input.userId,
      connectionId: input.connectionId,
    });
    if (result.documents?.length) {
      await upsertDocumentBatch(result.documents);
      for (const doc of result.documents) {
        if (!doc.rawText) continue;
        await this.ingestNormalizedDocument({
          userId: doc.userId,
          source: doc.source,
          sourceId: doc.sourceId ?? doc.itemId,
          title: doc.title,
          url: doc.url,
          author: doc.author,
          rawText: doc.rawText,
          rawJson: doc.rawJson,
          metadata: doc.metadata,
        });
      }
    }
    logger.info("connection sync completed", {
      userId: input.userId,
      connectionId: input.connectionId,
      inserted: result.inserted,
      skipped: result.skipped,
      failed: result.failed,
    });
  }

  async listAvailableConnectionProviders(userId: string): Promise<string[]> {
    const connections = await listConnections(userId);
    return connections.map((connection) => connection.provider);
  }
}
