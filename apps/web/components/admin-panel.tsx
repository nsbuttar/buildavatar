"use client";

import { useEffect, useState } from "react";

type AuditLog = {
  id: string;
  action: string;
  objectType: string;
  objectId: string;
  details: Record<string, unknown>;
  timestamp: string;
};

type Analytics = {
  knowledgeItemCount: number;
  chunkCount: number;
  memoryCount: number;
  conversationCount: number;
  messageCount: number;
};

type Task = {
  id: string;
  title: string;
  notes: string | null;
  createdAt: string;
};

type QueueStats = {
  queue: "ingestion-jobs" | "reflection-jobs" | "connection-sync-jobs";
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
};

type FailedJob = {
  queue: QueueStats["queue"];
  id: string;
  name: string;
  failedReason: string | null;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
};

export function AdminPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [queueError, setQueueError] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    const [logsResponse, jobsResponse] = await Promise.all([
      fetch("/api/admin/logs"),
      fetch("/api/admin/jobs"),
    ]);

    if (logsResponse.ok) {
      const payload = (await logsResponse.json()) as {
        logs: AuditLog[];
        analytics: Analytics;
        tasks: Task[];
      };
      setLogs(payload.logs);
      setAnalytics(payload.analytics);
      setTasks(payload.tasks);
    }

    const jobsPayload = (await jobsResponse.json().catch(() => null)) as
      | {
          stats: QueueStats[];
          failedJobs: FailedJob[];
          error?: string;
        }
      | null;
    if (jobsResponse.ok && jobsPayload) {
      setQueueStats(jobsPayload.stats);
      setFailedJobs(jobsPayload.failedJobs);
      setQueueError("");
    } else {
      setQueueStats([]);
      setFailedJobs([]);
      setQueueError(jobsPayload?.error ?? "Queue dashboard unavailable");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="label">Observability</p>
        <h1 className="text-3xl font-semibold font-[var(--font-title)]">Admin and logs</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Request-level audit log, ingestion lifecycle, and privacy controls.
        </p>
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Analytics snapshot</h2>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        {analytics ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Knowledge items" value={analytics.knowledgeItemCount} />
            <Metric label="Chunks" value={analytics.chunkCount} />
            <Metric label="Memories" value={analytics.memoryCount} />
            <Metric label="Conversations" value={analytics.conversationCount} />
            <Metric label="Messages" value={analytics.messageCount} />
          </div>
        ) : null}
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Background job dashboard</h2>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        {queueError ? <p className="mt-2 text-sm text-amber-700">{queueError}</p> : null}
        {queueStats.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {queueStats.map((queue) => (
              <div key={queue.queue} className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-sm font-semibold">{queue.queue}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  waiting {queue.waiting} | active {queue.active} | delayed {queue.delayed}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  failed {queue.failed} | completed {queue.completed}
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                  onClick={async () => {
                    await fetch("/api/admin/jobs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        queue: queue.queue,
                        retryAll: true,
                      }),
                    });
                    await load();
                  }}
                >
                  Retry all failed
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {failedJobs.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No failed jobs.</p>
          ) : (
            failedJobs.map((job) => (
              <div key={`${job.queue}:${job.id}`} className="rounded-xl border border-[var(--line)] bg-white p-3">
                <p className="text-sm font-semibold">
                  {job.queue} / {job.name} / {job.id}
                </p>
                <p className="text-xs text-rose-700">
                  {job.failedReason ?? "Unknown failure"} (attempts: {job.attemptsMade})
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                  onClick={async () => {
                    await fetch("/api/admin/jobs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        queue: job.queue,
                        jobId: job.id,
                      }),
                    });
                    await load();
                  }}
                >
                  Retry job
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-semibold">Internal tasks (agent tool)</h2>
        <div className="mt-3 space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No tasks created yet.</p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
              >
                <p className="font-medium">{task.title}</p>
                <p className="text-[var(--muted)]">{task.notes}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-semibold">Audit log</h2>
        <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
            >
              <p className="font-medium">{log.action}</p>
              <p className="text-xs text-[var(--muted)]">
                {new Date(log.timestamp).toLocaleString()} | {log.objectType}:{log.objectId}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-semibold">Privacy controls</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm"
            onClick={async () => {
              const response = await fetch("/api/privacy/export");
              const payload = await response.json();
              const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `avatar-os-export-${Date.now()}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
              setStatus("Export downloaded.");
            }}
          >
            Export my data
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-700"
            onClick={async () => {
              const confirmed = window.confirm(
                "Delete all Avatar OS data for this user? This cannot be undone.",
              );
              if (!confirmed) return;
              const response = await fetch("/api/privacy/delete", {
                method: "DELETE",
              });
              if (response.ok) {
                setStatus("All user data deleted. Sign in again to start fresh.");
              } else {
                setStatus("Failed to delete data.");
              }
            }}
          >
            Delete all data
          </button>
        </div>
        {status ? <p className="mt-3 text-sm text-[var(--brand)]">{status}</p> : null}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
