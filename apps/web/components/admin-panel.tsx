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

export function AdminPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState("");

  const load = async () => {
    const response = await fetch("/api/admin/logs");
    if (!response.ok) return;
    const payload = (await response.json()) as {
      logs: AuditLog[];
      analytics: Analytics;
      tasks: Task[];
    };
    setLogs(payload.logs);
    setAnalytics(payload.analytics);
    setTasks(payload.tasks);
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

