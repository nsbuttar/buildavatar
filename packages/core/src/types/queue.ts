export type IngestionJobPayload =
  | {
      kind: "file";
      userId: string;
      knowledgeItemId: string;
      objectKey: string;
      fileName: string;
      mimeType: string;
    }
  | {
      kind: "connector";
      userId: string;
      provider: "github" | "youtube" | "x";
      connectionId: string;
    };

export interface ReflectionJobPayload {
  userId: string;
  conversationId: string;
  messageIds: string[];
}

export interface SyncConnectionJobPayload {
  userId: string;
  provider: "github" | "youtube" | "x";
  connectionId: string;
}

export interface AudioJobPayload {
  userId: string;
  text: string;
  voice: string;
  voiceCloneProfileId?: string;
  consentGranted: boolean;
}

