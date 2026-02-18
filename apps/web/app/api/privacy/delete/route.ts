import { NextRequest, NextResponse } from "next/server";

import { hardDeleteUserData } from "@avatar/core";

import { withApiGuard } from "@/lib/api";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    await hardDeleteUserData(userId);
    return NextResponse.json({
      ok: true,
      message: "All user data deleted.",
    });
  });
}

