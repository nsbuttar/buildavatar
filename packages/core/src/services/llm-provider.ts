import { decryptJson } from "../crypto";
import { logger } from "../logger";
import type { ConnectionRecord } from "../types/domain";
import type { LlmAdapter } from "../adapters/interfaces";
import { GeminiLlmAdapter } from "../adapters/gemini";
import { OpenAiLlmAdapter } from "../adapters/openai";
import { listConnections, upsertConnection } from "./repositories";

export type ConnectedLlmProvider = "openai" | "gemini";

interface LlmConnectionToken {
  apiKey: string;
}

interface LlmConnectionMetadata {
  model?: string;
  isDefault?: boolean;
}

const CONNECTED_LLM_PROVIDERS: ConnectedLlmProvider[] = ["openai", "gemini"];

export function isConnectedLlmProvider(provider: string): provider is ConnectedLlmProvider {
  return CONNECTED_LLM_PROVIDERS.includes(provider as ConnectedLlmProvider);
}

function getLlmConnectionMetadata(connection: ConnectionRecord): LlmConnectionMetadata {
  return connection.metadata as LlmConnectionMetadata;
}

function pickPreferredLlmConnection(
  connections: ConnectionRecord[],
): ConnectionRecord | null {
  const eligible = connections
    .filter(
      (connection) =>
        isConnectedLlmProvider(connection.provider) &&
        connection.status === "connected" &&
        typeof connection.encryptedTokens === "string" &&
        connection.encryptedTokens.length > 0,
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  if (eligible.length === 0) return null;

  const explicitDefault = eligible.find((connection) => {
    const metadata = getLlmConnectionMetadata(connection);
    return metadata.isDefault === true;
  });
  return explicitDefault ?? eligible[0];
}

function buildConnectedLlmAdapter(connection: ConnectionRecord): LlmAdapter | null {
  if (!connection.encryptedTokens) return null;

  let tokenPayload: LlmConnectionToken;
  try {
    tokenPayload = decryptJson<LlmConnectionToken>(connection.encryptedTokens);
  } catch (error) {
    logger.warn("failed to decrypt llm provider tokens", {
      connectionId: connection.id,
      provider: connection.provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (!tokenPayload.apiKey || typeof tokenPayload.apiKey !== "string") {
    logger.warn("llm provider connection is missing api key", {
      connectionId: connection.id,
      provider: connection.provider,
    });
    return null;
  }

  const metadata = getLlmConnectionMetadata(connection);
  const modelName = typeof metadata.model === "string" ? metadata.model : undefined;

  try {
    if (connection.provider === "openai") {
      return new OpenAiLlmAdapter({
        apiKey: tokenPayload.apiKey,
        modelName,
      });
    }
    if (connection.provider === "gemini") {
      return new GeminiLlmAdapter({
        apiKey: tokenPayload.apiKey,
        modelName,
      });
    }
  } catch (error) {
    logger.error("failed to initialize connected llm adapter", {
      connectionId: connection.id,
      provider: connection.provider,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}

export async function resolveUserLlmAdapter(input: {
  userId: string;
  fallback: LlmAdapter;
}): Promise<{
  adapter: LlmAdapter;
  provider: ConnectedLlmProvider | "fallback";
}> {
  const connections = await listConnections(input.userId);
  const preferredConnection = pickPreferredLlmConnection(connections);
  if (!preferredConnection) {
    return {
      adapter: input.fallback,
      provider: "fallback",
    };
  }
  if (!isConnectedLlmProvider(preferredConnection.provider)) {
    return {
      adapter: input.fallback,
      provider: "fallback",
    };
  }

  const connectedAdapter = buildConnectedLlmAdapter(preferredConnection);
  if (!connectedAdapter) {
    return {
      adapter: input.fallback,
      provider: "fallback",
    };
  }

  return {
    adapter: connectedAdapter,
    provider: preferredConnection.provider,
  };
}

export async function setDefaultConnectedLlmProvider(input: {
  userId: string;
  provider: ConnectedLlmProvider;
}): Promise<void> {
  const connections = await listConnections(input.userId);
  const eligibleConnections = connections.filter(
    (connection) =>
      isConnectedLlmProvider(connection.provider) &&
      connection.status === "connected" &&
      typeof connection.encryptedTokens === "string" &&
      connection.encryptedTokens.length > 0,
  );

  const target = eligibleConnections.find(
    (connection) => connection.provider === input.provider,
  );
  if (!target) {
    throw new Error(`Connected ${input.provider} provider not found`);
  }

  await Promise.all(
    eligibleConnections.map(async (connection) => {
      const metadata = getLlmConnectionMetadata(connection);
      await upsertConnection({
        userId: input.userId,
        provider: connection.provider,
        scopes: connection.scopes,
        status: connection.status,
        metadata: {
          ...metadata,
          isDefault: connection.provider === input.provider,
        },
      });
    }),
  );
}
