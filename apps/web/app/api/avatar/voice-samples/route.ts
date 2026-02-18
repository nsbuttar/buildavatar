import { createHash, randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  appendAuditLog,
  getUserById,
  updateUserProfile,
} from "@avatar/core";

import { deps } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

const MAX_SAMPLES = 8;
const MAX_SAMPLE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const formData = await request.formData();
    const consent = String(formData.get("consent") ?? "") === "true";
    if (!consent) {
      return NextResponse.json(
        { error: "Voice cloning requires explicit consent checkbox." },
        { status: 400 },
      );
    }
    const files = formData
      .getAll("samples")
      .filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "At least one sample is required." }, { status: 400 });
    }
    if (files.length > MAX_SAMPLES) {
      return NextResponse.json(
        { error: `At most ${MAX_SAMPLES} samples are allowed.` },
        { status: 400 },
      );
    }
    const invalidType = files.find((file) => !file.type.startsWith("audio/"));
    if (invalidType) {
      return NextResponse.json(
        { error: `Invalid sample type for ${invalidType.name}. Audio files only.` },
        { status: 400 },
      );
    }
    const oversized = files.find((file) => file.size > MAX_SAMPLE_BYTES);
    if (oversized) {
      return NextResponse.json(
        {
          error: `Sample ${oversized.name} exceeds ${Math.floor(MAX_SAMPLE_BYTES / (1024 * 1024))}MB limit.`,
        },
        { status: 400 },
      );
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        {
          error: `Total sample size exceeds ${Math.floor(MAX_TOTAL_BYTES / (1024 * 1024))}MB.`,
        },
        { status: 400 },
      );
    }

    const hasher = createHash("sha256");
    for (const file of files) {
      const chunk = await file.arrayBuffer();
      hasher.update(Buffer.from(chunk));
    }
    const profileId = `vc_${hasher.digest("hex").slice(0, 24)}`;

    for (const file of files) {
      const payload = Buffer.from(await file.arrayBuffer());
      const key = `${userId}/voice-samples/${profileId}/${Date.now()}-${randomUUID()}-${file.name}`;
      await deps.storage.putObject({
        key,
        contentType: file.type || "audio/wav",
        bytes: payload,
      });
    }
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const updated = await updateUserProfile({
      userId,
      voiceCloneConsent: true,
      voiceCloneProfileId: profileId,
    });
    await appendAuditLog(null, {
      userId,
      action: "voice.clone_profile_created",
      objectType: "user",
      objectId: userId,
      details: {
        sampleCount: files.length,
        profileId,
      },
    });
    return NextResponse.json({
      ok: true,
      profileId,
      user: updated,
      note:
        "Voice samples were stored. This MVP uses consent-gated profile IDs and neutral fallback voice when consent is absent.",
    });
  });
}
