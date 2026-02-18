import {
  getEmbeddingAdapter,
  getLlmAdapter,
  getStorageAdapter,
  getTtsAdapter,
  getVectorStoreAdapter,
  GitHubConnector,
  IngestionService,
  YouTubeConnector,
  XConnectorSkeleton,
} from "@avatar/core";

export const deps = {
  llm: getLlmAdapter(),
  embeddings: getEmbeddingAdapter(),
  vectorStore: getVectorStoreAdapter(),
  storage: getStorageAdapter(),
  tts: getTtsAdapter(),
};

export const connectors = {
  github: new GitHubConnector(),
  youtube: new YouTubeConnector(),
  x: new XConnectorSkeleton(),
};

export const ingestionService = new IngestionService(
  deps.embeddings,
  deps.vectorStore,
  deps.storage,
);

