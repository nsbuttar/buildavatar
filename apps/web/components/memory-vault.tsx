"use client";

import { useEffect, useState } from "react";

type Memory = {
  id: string;
  type: "fact" | "preference" | "project" | "person";
  content: string;
  confidence: number;
  pinned: boolean;
  updatedAt: string;
};

export function MemoryVault() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState({
    type: "fact" as Memory["type"],
    content: "",
    confidence: 0.8,
    pinned: false,
  });

  const load = async () => {
    const response = await fetch("/api/memories");
    if (!response.ok) return;
    const payload = (await response.json()) as { memories: Memory[] };
    setMemories(payload.memories);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="label">Memory Vault</p>
        <h1 className="text-3xl font-semibold font-[var(--font-title)]">
          Inspect and edit long-term memory
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          You can pin, edit, or delete memories. This directly changes future responses.
        </p>
      </section>

      <section className="card p-6">
        <h2 className="text-xl font-semibold">Add memory</h2>
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setStatus("");
            const response = await fetch("/api/memories", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(draft),
            });
            if (response.ok) {
              setStatus("Memory added.");
              setDraft({
                type: "fact",
                content: "",
                confidence: 0.8,
                pinned: false,
              });
              await load();
            } else {
              setStatus("Failed to add memory.");
            }
          }}
        >
          <select
            className="rounded-xl border border-[var(--line)] px-3 py-2"
            value={draft.type}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                type: event.target.value as Memory["type"],
              }))
            }
          >
            <option value="fact">Fact</option>
            <option value="preference">Preference</option>
            <option value="project">Project</option>
            <option value="person">Person</option>
          </select>
          <textarea
            className="min-h-24 rounded-xl border border-[var(--line)] px-3 py-2"
            value={draft.content}
            onChange={(event) =>
              setDraft((current) => ({ ...current, content: event.target.value }))
            }
          />
          <label className="flex items-center gap-2 text-sm">
            Confidence
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={draft.confidence}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  confidence: Number(event.target.value),
                }))
              }
              className="w-24 rounded-lg border border-[var(--line)] px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.pinned}
              onChange={(event) =>
                setDraft((current) => ({ ...current, pinned: event.target.checked }))
              }
            />
            Pin memory
          </label>
          <button
            type="submit"
            className="w-fit rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
          >
            Save memory
          </button>
        </form>
        {status ? <p className="mt-3 text-sm text-[var(--brand)]">{status}</p> : null}
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Stored memories</h2>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {memories.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No memories yet.</p>
          ) : (
            memories.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} onUpdated={load} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function MemoryRow({
  memory,
  onUpdated,
}: {
  memory: Memory;
  onUpdated: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [pinned, setPinned] = useState(memory.pinned);
  const [type, setType] = useState(memory.type);
  const [confidence, setConfidence] = useState(memory.confidence);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white p-4">
      {editing ? (
        <div className="space-y-2">
          <select
            className="rounded-lg border border-[var(--line)] px-2 py-1"
            value={type}
            onChange={(event) => setType(event.target.value as Memory["type"])}
          >
            <option value="fact">Fact</option>
            <option value="preference">Preference</option>
            <option value="project">Project</option>
            <option value="person">Person</option>
          </select>
          <textarea
            className="min-h-20 w-full rounded-lg border border-[var(--line)] px-2 py-1"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            Confidence
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
              className="w-24 rounded-lg border border-[var(--line)] px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
            />
            Pinned
          </label>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
              type="button"
              onClick={async () => {
                await fetch(`/api/memories/${memory.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type,
                    content,
                    confidence,
                    pinned,
                  }),
                });
                setEditing(false);
                await onUpdated();
              }}
            >
              Save
            </button>
            <button
              className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {memory.type} | confidence {memory.confidence.toFixed(2)}
            {memory.pinned ? " | pinned" : ""}
          </p>
          <p>{memory.content}</p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
              type="button"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              className="rounded-lg border border-rose-200 px-3 py-1 text-sm text-rose-700"
              type="button"
              onClick={async () => {
                await fetch(`/api/memories/${memory.id}`, {
                  method: "DELETE",
                });
                await onUpdated();
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

