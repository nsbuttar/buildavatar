import type { ConnectorAdapter } from "../adapters/interfaces";
import type { ConnectorSyncResult, IngestedDocument } from "../types/domain";

export class XConnectorSkeleton implements ConnectorAdapter {
  provider = "x";

  async sync(): Promise<ConnectorSyncResult & { documents: IngestedDocument[] }> {
    return {
      inserted: 0,
      skipped: 0,
      failed: 0,
      errors: [
        "X/Twitter connector requires elevated API access. Adapter skeleton is implemented; add API credentials and sync logic.",
      ],
      documents: [],
    };
  }

  async toDocuments(): Promise<IngestedDocument[]> {
    return [];
  }
}

