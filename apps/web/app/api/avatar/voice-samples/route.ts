import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  appendAuditLog,
  getUserById,
  sha256Hex,
  updateUserProfile,
} from "@avatar/core";

import { deps } from "@/lib/deps";
import { withApiGuard } from "@/lib/api";

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
    const bytes = await Promise.all(files.map((file) => file.arrayBuffer()));
    const profileSeed = Buffer.concat(bytes.map((chunk) => Buffer.from(chunk)));
    const profileId = `vc_${sha256Hex(profileSeed).slice(0, 24)}`;

    for (const [idx, file] of files.entries()) {
      const payload = Buffer.from(bytes[idx]);
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

