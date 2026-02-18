import { NextRequest, NextResponse } from "next/server";

import { exportUserData } from "@avatar/core";

import { withApiGuard } from "@/lib/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const data = await exportUserData(userId);
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      data,
    });
  });
}

