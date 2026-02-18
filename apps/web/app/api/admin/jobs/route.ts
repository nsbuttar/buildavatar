import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  QUEUE_NAMES,
  getQueueDashboard,
  retryAllFailedJobs,
  retryFailedJob,
} from "@avatar/core";

import { withApiGuard } from "@/lib/api";

const retrySchema = z.object({
  queue: z.enum([
    QUEUE_NAMES.INGESTION,
    QUEUE_NAMES.REFLECTION,
    QUEUE_NAMES.CONNECTION_SYNC,
  ]),
  jobId: z.string().optional(),
  retryAll: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async () => {
    try {
      const data = await getQueueDashboard();
      return NextResponse.json(data);
    } catch (error) {
      return NextResponse.json(
        {
          stats: [],
          failedJobs: [],
          error: error instanceof Error ? error.message : "Queue dashboard unavailable",
        },
        { status: 503 },
      );
    }
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiGuard(request, async () => {
    const body = await request.json();
    const parsed = retrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    if (parsed.data.retryAll) {
      const result = await retryAllFailedJobs({
        queue: parsed.data.queue,
      });
      return NextResponse.json({ ok: true, retried: result.count });
    }
    if (!parsed.data.jobId) {
      return NextResponse.json(
        { error: "jobId is required when retryAll is false" },
        { status: 400 },
      );
    }
    const result = await retryFailedJob({
      queue: parsed.data.queue,
      jobId: parsed.data.jobId,
    });
    return NextResponse.json({ ok: true, retried: result.retried });
  });
}

