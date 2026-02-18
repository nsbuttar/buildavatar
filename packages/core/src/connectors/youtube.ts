import { decryptJson, sha256Hex } from "../crypto";
import { getConnectionById } from "../services/repositories";
import type { ConnectorAdapter } from "../adapters/interfaces";
import {
  getErrorRetryAfterMs,
  getErrorStatus,
  isLikelyTransientError,
  retryAsync,
} from "../services/retry";
import type { ConnectorSyncResult, IngestedDocument } from "../types/domain";

interface YouTubeCredentials {
  apiKey: string;
  channelId: string;
}

interface YouTubeSearchResponse {
  items: Array<{
    id: {
      videoId: string;
    };
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      channelTitle: string;
    };
  }>;
}

class YouTubeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly headers: Headers,
  ) {
    super(message);
    this.name = "YouTubeHttpError";
  }
}

function shouldRetryYouTubeError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 408 || status === 429) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }
  return isLikelyTransientError(error);
}

export class YouTubeConnector implements ConnectorAdapter {
  provider = "youtube";

  async sync(input: {
    userId: string;
    connectionId: string;
  }): Promise<ConnectorSyncResult & { documents: IngestedDocument[] }> {
    const connection = await getConnectionById(input.connectionId);
    if (!connection?.encryptedSecrets) {
      throw new Error("YouTube connection missing API credentials");
    }
    const secrets = decryptJson<YouTubeCredentials>(connection.encryptedSecrets);
    const query = new URLSearchParams({
      key: secrets.apiKey,
      part: "snippet",
      channelId: secrets.channelId,
      maxResults: "25",
      order: "date",
      type: "video",
    });
    const response = await retryAsync(
      async () => {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/search?${query.toString()}`,
        );
        if (!res.ok) {
          throw new YouTubeHttpError(
            `YouTube API error: ${res.status} ${res.statusText}`,
            res.status,
            res.headers,
          );
        }
        return res;
      },
      {
        attempts: 4,
        minDelayMs: 500,
        maxDelayMs: 12_000,
        jitter: 0.1,
        shouldRetry: shouldRetryYouTubeError,
        retryAfterMs: getErrorRetryAfterMs,
      },
    );
    const payload = (await response.json()) as YouTubeSearchResponse;
    const documents: IngestedDocument[] = payload.items.map((item) => {
      const text = [
        `Video Title: ${item.snippet.title}`,
        `Description: ${item.snippet.description || "N/A"}`,
        `Channel: ${item.snippet.channelTitle}`,
      ].join("\n\n");
      return {
        itemId: `youtube:video:${item.id.videoId}`,
        userId: input.userId,
        source: "youtube",
        sourceId: `video:${item.id.videoId}`,
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        author: item.snippet.channelTitle,
        createdAt: new Date(item.snippet.publishedAt),
        rawText: text,
        rawJson: item as unknown as Record<string, unknown>,
        metadata: {
          source: "youtube",
          contentHash: sha256Hex(text),
        },
      };
    });
    return {
      inserted: documents.length,
      skipped: 0,
      failed: 0,
      errors: [],
      documents,
    };
  }

  async toDocuments(input: {
    userId: string;
    payload: Record<string, unknown>;
  }): Promise<IngestedDocument[]> {
    const text = JSON.stringify(input.payload, null, 2);
    return [
      {
        itemId: `youtube:payload:${Date.now()}`,
        userId: input.userId,
        source: "youtube",
        rawText: text,
        metadata: {
          source: "youtube",
          contentHash: sha256Hex(text),
        },
      },
    ];
  }
}
