import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  avatarSpeechModes,
  getUserById,
  synthesizeAvatarSpeech,
} from "@avatar/core";

import { deps } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

const schema = z.object({
  text: z.string().min(1).max(4000),
  preferredVoice: z.string().max(64).optional(),
  speechMode: z.enum(avatarSpeechModes).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(
    request,
    async ({ userId }) => {
      const body = await request.json();
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      }
      const user = await getUserById(userId);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const speech = await synthesizeAvatarSpeech(deps.tts, {
        text: parsed.data.text,
        fallbackVoice: parsed.data.preferredVoice ?? "alloy",
        consentGranted: user.voiceCloneConsent,
        voiceCloneProfileId: user.voiceCloneProfileId ?? undefined,
        speechMode: parsed.data.speechMode ?? "balanced",
      });
      return NextResponse.json(speech);
    },
    { maxRequests: 25, windowMs: 60_000 },
  );
}
