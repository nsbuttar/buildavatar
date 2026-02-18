import type { TtsAdapter } from "../adapters/interfaces";

export const avatarSpeechModes = ["realtime", "balanced", "cinematic"] as const;

export type AvatarSpeechMode = (typeof avatarSpeechModes)[number];

export type AvatarVisemeCue = {
  viseme: string;
  startMs: number;
  endMs: number;
};

export type AvatarLipSyncProfile = {
  mode: AvatarSpeechMode;
  minCueMs: number;
  mergeGapMs: number;
  jitterSpikeMs: number;
  switchHoldMs: number;
};

function getLipSyncProfile(mode: AvatarSpeechMode): AvatarLipSyncProfile {
  switch (mode) {
    case "realtime":
      return {
        mode,
        minCueMs: 45,
        mergeGapMs: 14,
        jitterSpikeMs: 28,
        switchHoldMs: 34,
      };
    case "cinematic":
      return {
        mode,
        minCueMs: 95,
        mergeGapMs: 26,
        jitterSpikeMs: 60,
        switchHoldMs: 72,
      };
    default:
      return {
        mode: "balanced",
        minCueMs: 70,
        mergeGapMs: 20,
        jitterSpikeMs: 44,
        switchHoldMs: 54,
      };
  }
}

function normalizeCue(cue: AvatarVisemeCue): AvatarVisemeCue | null {
  const start = Number.isFinite(cue.startMs) ? Math.max(0, Math.floor(cue.startMs)) : NaN;
  const end = Number.isFinite(cue.endMs) ? Math.max(0, Math.floor(cue.endMs)) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return {
    viseme: typeof cue.viseme === "string" && cue.viseme.trim() ? cue.viseme.trim().toUpperCase() : "M",
    startMs: start,
    endMs: end,
  };
}

function normalizeTimeline(cues: AvatarVisemeCue[]): AvatarVisemeCue[] {
  const sorted = cues
    .map(normalizeCue)
    .filter((cue): cue is AvatarVisemeCue => cue !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (!sorted.length) return [];

  const normalized: AvatarVisemeCue[] = [];
  let cursor = 0;
  for (const cue of sorted) {
    const startMs = Math.max(cue.startMs, cursor);
    const endMs = Math.max(startMs + 1, cue.endMs);
    normalized.push({
      viseme: cue.viseme,
      startMs,
      endMs,
    });
    cursor = endMs;
  }
  return normalized;
}

function mergeAdjacent(cues: AvatarVisemeCue[], mergeGapMs: number): AvatarVisemeCue[] {
  const merged: AvatarVisemeCue[] = [];
  for (const cue of cues) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push({ ...cue });
      continue;
    }
    if (cue.startMs < prev.endMs) {
      cue.startMs = prev.endMs;
    }
    const gap = cue.startMs - prev.endMs;
    if (prev.viseme === cue.viseme && gap <= mergeGapMs) {
      prev.endMs = Math.max(prev.endMs, cue.endMs);
      continue;
    }
    merged.push({ ...cue });
  }
  return merged;
}

function collapseJitterSpikes(
  cues: AvatarVisemeCue[],
  jitterSpikeMs: number,
): AvatarVisemeCue[] {
  if (cues.length < 3) return cues.map((cue) => ({ ...cue }));

  const collapsed: AvatarVisemeCue[] = [];
  let index = 0;
  while (index < cues.length) {
    const current = { ...cues[index] };
    const prev = collapsed[collapsed.length - 1];
    const next = cues[index + 1];
    const duration = current.endMs - current.startMs;

    if (
      prev &&
      next &&
      duration <= jitterSpikeMs &&
      prev.viseme === next.viseme
    ) {
      prev.endMs = Math.max(prev.endMs, next.endMs);
      index += 2;
      continue;
    }

    collapsed.push(current);
    index += 1;
  }
  return collapsed;
}

function enforceMinimumCueDuration(
  cues: AvatarVisemeCue[],
  minCueMs: number,
): AvatarVisemeCue[] {
  if (!cues.length) return [];

  const stretched: AvatarVisemeCue[] = [];
  let cursor = 0;
  for (const cue of cues) {
    const startMs = Math.max(cue.startMs, cursor);
    const endMs = Math.max(startMs + minCueMs, cue.endMs);
    stretched.push({
      viseme: cue.viseme,
      startMs,
      endMs,
    });
    cursor = endMs;
  }
  return stretched;
}

export function stabilizeVisemeTimeline(
  rawCues: AvatarVisemeCue[],
  profile: AvatarLipSyncProfile,
): AvatarVisemeCue[] {
  const normalized = normalizeTimeline(rawCues);
  if (!normalized.length) {
    return [
      {
        viseme: "M",
        startMs: 0,
        endMs: profile.minCueMs,
      },
    ];
  }

  const merged = mergeAdjacent(normalized, profile.mergeGapMs);
  const collapsed = collapseJitterSpikes(merged, profile.jitterSpikeMs);
  const stretched = enforceMinimumCueDuration(collapsed, profile.minCueMs);
  const stabilized = mergeAdjacent(stretched, 0);

  return stabilized.map((cue) => ({
    viseme: cue.viseme || "M",
    startMs: cue.startMs,
    endMs: cue.endMs,
  }));
}

export async function synthesizeAvatarSpeech(
  tts: TtsAdapter,
  input: {
    text: string;
    fallbackVoice: string;
    consentGranted: boolean;
    voiceCloneProfileId?: string;
    speechMode?: AvatarSpeechMode;
  },
): Promise<{
  mimeType: string;
  audioBase64: string;
  visemes: AvatarVisemeCue[];
  voice: string;
  lipSyncProfile: AvatarLipSyncProfile;
}> {
  const lipSyncProfile = getLipSyncProfile(input.speechMode ?? "balanced");
  const result = await tts.synthesize({
    text: input.text,
    fallbackVoice: input.fallbackVoice,
    consentGranted: input.consentGranted,
    voiceCloneProfileId: input.voiceCloneProfileId,
  });
  const visemes = stabilizeVisemeTimeline(result.visemes, lipSyncProfile);

  return {
    mimeType: result.mimeType,
    audioBase64: result.audioBuffer.toString("base64"),
    visemes,
    voice: result.usedVoice,
    lipSyncProfile,
  };
}
