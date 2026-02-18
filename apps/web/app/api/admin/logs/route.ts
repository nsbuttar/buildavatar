import { NextRequest, NextResponse } from "next/server";

import { getBasicAnalytics, listAuditLogs, listTasks } from "@avatar/core";

import { withApiGuard } from "@/lib/api";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async ({ userId }) => {
    const [logs, analytics, tasks] = await Promise.all([
      listAuditLogs(userId),
      getBasicAnalytics(userId),
      listTasks(userId),
    ]);
    return NextResponse.json({
      logs,
      analytics,
      tasks,
    });
  });
}

