import { describe, expect, it } from "vitest";

import type { TtsAdapter } from "../adapters/interfaces";
import { synthesizeAvatarSpeech } from "./avatar";

describe("synthesizeAvatarSpeech", () => {
  it("stabilizes jitter spikes and preserves monotonic cues", async () => {
    const tts: TtsAdapter = {
      synthesize: async () => ({
        mimeType: "audio/mpeg",
        audioBuffer: Buffer.from("test"),
        usedVoice: "alloy",
        visemes: [
          { viseme: "A", startMs: 0, endMs: 120 },
          { viseme: "E", startMs: 120, endMs: 130 },
          { viseme: "A", startMs: 130, endMs: 250 },
        ],
      }),
    };

    const result = await synthesizeAvatarSpeech(tts, {
      text: "hello there",
      fallbackVoice: "alloy",
      consentGranted: false,
      speechMode: "balanced",
    });

    expect(result.visemes).toHaveLength(1);
    expect(result.visemes[0].viseme).toBe("A");
    expect(result.visemes[0].startMs).toBe(0);
    expect(result.visemes[0].endMs).toBeGreaterThanOrEqual(result.lipSyncProfile.minCueMs);
  });

  it("returns a neutral cue when adapter yields none", async () => {
    const tts: TtsAdapter = {
      synthesize: async () => ({
        mimeType: "audio/mpeg",
        audioBuffer: Buffer.from("test"),
        usedVoice: "alloy",
        visemes: [],
      }),
    };

    const result = await synthesizeAvatarSpeech(tts, {
      text: "hi",
      fallbackVoice: "alloy",
      consentGranted: false,
    });

    expect(result.visemes).toHaveLength(1);
    expect(result.visemes[0].viseme).toBe("M");
    expect(result.visemes[0].startMs).toBe(0);
    expect(result.visemes[0].endMs).toBe(result.lipSyncProfile.minCueMs);
  });

  it("exposes stricter smoothing profile for cinematic mode", async () => {
    const tts: TtsAdapter = {
      synthesize: async () => ({
        mimeType: "audio/mpeg",
        audioBuffer: Buffer.from("test"),
        usedVoice: "alloy",
        visemes: [
          { viseme: "A", startMs: 0, endMs: 45 },
          { viseme: "E", startMs: 45, endMs: 80 },
          { viseme: "I", startMs: 80, endMs: 130 },
        ],
      }),
    };

    const realtime = await synthesizeAvatarSpeech(tts, {
      text: "hi",
      fallbackVoice: "alloy",
      consentGranted: false,
      speechMode: "realtime",
    });
    const cinematic = await synthesizeAvatarSpeech(tts, {
      text: "hi",
      fallbackVoice: "alloy",
      consentGranted: false,
      speechMode: "cinematic",
    });

    expect(cinematic.lipSyncProfile.minCueMs).toBeGreaterThan(
      realtime.lipSyncProfile.minCueMs,
    );
    expect(cinematic.lipSyncProfile.switchHoldMs).toBeGreaterThan(
      realtime.lipSyncProfile.switchHoldMs,
    );
  });
});
