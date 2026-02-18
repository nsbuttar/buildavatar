import { decryptJson } from "../crypto";
import { getConnectionById } from "../services/repositories";
import type { ConnectorAdapter } from "../adapters/interfaces";
import { sha256Hex } from "../crypto";
import {
  getErrorRetryAfterMs,
  getErrorStatus,
  isLikelyTransientError,
  retryAsync,
} from "../services/retry";
import type { ConnectorSyncResult, IngestedDocument } from "../types/domain";

interface GitHubRepo {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
  owner: {
    login: string;
  };
}

interface ConnectionToken {
  accessToken: string;
}

class GitHubHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly headers: Headers,
  ) {
    super(message);
    this.name = "GitHubHttpError";
  }
}

function shouldRetryGitHubError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 408 || status === 429) {
    return true;
  }
  if (typeof status === "number" && status >= 500) {
    return true;
  }
  return isLikelyTransientError(error);
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const response = await retryAsync(
    async () => {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!res.ok) {
        throw new GitHubHttpError(
          `GitHub API error: ${res.status} ${res.statusText}`,
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
      shouldRetry: shouldRetryGitHubError,
      retryAfterMs: getErrorRetryAfterMs,
    },
  );
  return (await response.json()) as T;
}

async function fetchRepoReadme(
  repoFullName: string,
  token: string,
): Promise<string | null> {
  const readmeUrl = `https://raw.githubusercontent.com/${repoFullName}/HEAD/README.md`;
  const response = await retryAsync(
    async () => {
      const res = await fetch(readmeUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 404) {
        return res;
      }
      if (!res.ok) {
        throw new GitHubHttpError(
          `GitHub README fetch error: ${res.status} ${res.statusText}`,
          res.status,
          res.headers,
        );
      }
      return res;
    },
    {
      attempts: 3,
      minDelayMs: 400,
      maxDelayMs: 8_000,
      jitter: 0.1,
      shouldRetry: shouldRetryGitHubError,
      retryAfterMs: getErrorRetryAfterMs,
    },
  );
  if (response.status === 404) return null;
  return response.text();
}

export class GitHubConnector implements ConnectorAdapter {
  provider = "github";

  async sync(input: {
    userId: string;
    connectionId: string;
  }): Promise<ConnectorSyncResult & { documents: IngestedDocument[] }> {
    const connection = await getConnectionById(input.connectionId);
    if (!connection?.encryptedTokens) {
      throw new Error("GitHub connection token missing");
    }
    const token = decryptJson<ConnectionToken>(connection.encryptedTokens);
    const repos = await fetchJson<GitHubRepo[]>(
      "https://api.github.com/user/repos?sort=updated&per_page=20",
      token.accessToken,
    );

    const documents: IngestedDocument[] = [];
    for (const repo of repos) {
      const readme = await fetchRepoReadme(repo.full_name, token.accessToken);
      const summary = [
        `Repository: ${repo.full_name}`,
        `Description: ${repo.description ?? "N/A"}`,
        `Default Branch: ${repo.default_branch}`,
        `README:\n${readme ?? "No README found."}`,
      ].join("\n\n");
      documents.push({
        itemId: `github:repo:${repo.id}`,
        userId: input.userId,
        source: "github",
        sourceId: `repo:${repo.id}`,
        title: repo.full_name,
        url: repo.html_url,
        author: repo.owner.login,
        createdAt: new Date(repo.updated_at),
        rawText: summary,
        rawJson: repo as unknown as Record<string, unknown>,
        metadata: {
          repository: repo.full_name,
          source: "github",
          contentHash: sha256Hex(summary),
        },
      });
    }
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
    const content = JSON.stringify(input.payload, null, 2);
    return [
      {
        itemId: `github:payload:${Date.now()}`,
        userId: input.userId,
        source: "github",
        rawText: content,
        metadata: {
          source: "github",
          contentHash: sha256Hex(content),
        },
      },
    ];
  }
}
