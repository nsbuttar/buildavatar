"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  source: string;
  title: string | null;
  fetchedAt: string;
  deletedAt: string | null;
  metadata: Record<string, unknown>;
};

export function FileDropPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

  const load = async () => {
    const response = await fetch("/api/files");
    if (!response.ok) return;
    const payload = (await response.json()) as { items: Item[] };
    setItems(payload.items);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="label">File Drop</p>
        <h1 className="text-3xl font-semibold font-[var(--font-title)]">
          Upload docs for the avatar brain
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Supported formats: PDF, DOCX, TXT, MD, CSV.
        </p>
        <form
          className="mt-4 rounded-xl border border-[var(--line)] bg-white p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
            const file = fileInput?.files?.[0];
            if (!file) {
              setStatus("Select a file first.");
              return;
            }
            setUploading(true);
            setStatus("");
            const data = new FormData();
            data.append("file", file);
            const response = await fetch("/api/files/upload", {
              method: "POST",
              body: data,
            });
            setUploading(false);
            if (response.ok) {
              setStatus("Upload complete. Ingestion queued.");
              form.reset();
              await load();
            } else {
              const payload = await response.json().catch(() => ({}));
              setStatus(payload.error || "Upload failed.");
            }
          }}
        >
          <input
            name="file"
            type="file"
            className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            required
          />
          <button
            disabled={uploading}
            type="submit"
            className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Upload and ingest"}
          </button>
        </form>
        {status ? <p className="mt-3 text-sm text-[var(--brand)]">{status}</p> : null}
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <p className="label">Knowledge Items</p>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No uploaded items yet.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"
              >
                <div>
                  <p className="font-medium">{item.title ?? item.id}</p>
                  <p className="text-xs text-[var(--muted)]">
                    source: {item.source} | fetched: {new Date(item.fetchedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-rose-200 px-3 py-1 text-sm text-rose-700"
                  onClick={async () => {
                    await fetch("/api/files", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ knowledgeItemId: item.id }),
                    });
                    await load();
                  }}
                >
                  Delete data
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

