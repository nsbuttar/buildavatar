import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appendAuditLog, getUserById, updateUserProfile } from "@avatar/core";

import { withApiGuard } from "@/lib/api";

const updateSchema = z.object({
  shortBio: z.string().max(500).optional(),
  styleNotes: z.string().max(2000).optional(),
  allowLearningFromConversations: z.boolean().optional(),
  voiceCloneConsent: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const user = await getUserById(userId);
    return NextResponse.json({ user });
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const user = await updateUserProfile({
      userId,
      ...parsed.data,
    });
    await appendAuditLog(null, {
      userId,
      action: "user.profile_updated",
      objectType: "user",
      objectId: userId,
      details: parsed.data,
    });
    return NextResponse.json({ user });
  });
}

