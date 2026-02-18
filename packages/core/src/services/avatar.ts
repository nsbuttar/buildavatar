import type { TtsAdapter } from "../adapters/interfaces";

export async function synthesizeAvatarSpeech(
  tts: TtsAdapter,
  input: {
    text: string;
    fallbackVoice: string;
    consentGranted: boolean;
    voiceCloneProfileId?: string;
  },
): Promise<{
  mimeType: string;
  audioBase64: string;
  visemes: Array<{
    viseme: string;
    startMs: number;
    endMs: number;
  }>;
  voice: string;
}> {
  const result = await tts.synthesize({
    text: input.text,
    fallbackVoice: input.fallbackVoice,
    consentGranted: input.consentGranted,
    voiceCloneProfileId: input.voiceCloneProfileId,
  });
  return {
    mimeType: result.mimeType,
    audioBase64: result.audioBuffer.toString("base64"),
    visemes: result.visemes,
    voice: result.usedVoice,
  };
}

