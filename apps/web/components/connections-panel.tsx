"use client";

import { useEffect, useState } from "react";

type Connection = {
  id: string;
  provider: string;
  status: string;
  lastSyncedAt: string | null;
  scopes: string[];
};

export function ConnectionsPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [githubToken, setGithubToken] = useState("");
  const [youtubeApiKey, setYoutubeApiKey] = useState("");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    const response = await fetch("/api/connections");
    if (!response.ok) return;
    const payload = (await response.json()) as { connections: Connection[] };
    setConnections(payload.connections);
  };

  useEffect(() => {
    void load();
  }, []);

  const syncConnection = async (connectionId: string) => {
    await fetch("/api/connections/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-6">
        <div>
          <p className="label">Connections</p>
          <h1 className="text-3xl font-semibold font-[var(--font-title)]">
            Connect your data sources
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Tokens are encrypted at rest. Disconnecting removes associated retrieval data.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="text-lg font-semibold">GitHub OAuth</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Recommended. Uses OAuth and encrypted access tokens.
            </p>
            <a
              href="/api/connections/github/start"
              className="mt-3 inline-block rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-medium hover:bg-[var(--bg)]"
            >
              Connect with GitHub OAuth
            </a>
          </div>
          <form
            className="rounded-xl border border-[var(--line)] bg-white p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setStatus("");
              const response = await fetch("/api/connections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider: "github",
                  accessToken: githubToken,
                }),
              });
              if (response.ok) {
                setStatus("GitHub connected and sync queued.");
                setGithubToken("");
                await load();
              } else {
                setStatus("Failed to connect GitHub.");
              }
            }}
          >
            <h2 className="text-lg font-semibold">GitHub Token (fallback)</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Use only if OAuth setup is unavailable.
            </p>
            <input
              value={githubToken}
              onChange={(event) => setGithubToken(event.target.value)}
              placeholder="ghp_..."
              className="mt-3 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <button
              className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              Connect GitHub
            </button>
          </form>
        </div>

        <form
          className="rounded-xl border border-[var(--line)] bg-white p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setStatus("");
            const response = await fetch("/api/connections", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: "youtube",
                apiKey: youtubeApiKey,
                channelId: youtubeChannelId,
              }),
            });
            if (response.ok) {
              setStatus("YouTube connected and sync queued.");
              setYoutubeApiKey("");
              setYoutubeChannelId("");
              await load();
            } else {
              setStatus("Failed to connect YouTube.");
            }
          }}
        >
          <h2 className="text-lg font-semibold">YouTube Channel</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Ingests channel video titles and descriptions via YouTube Data API.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <input
              value={youtubeApiKey}
              onChange={(event) => setYoutubeApiKey(event.target.value)}
              placeholder="YouTube API key"
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
            <input
              value={youtubeChannelId}
              onChange={(event) => setYoutubeChannelId(event.target.value)}
              placeholder="Channel ID"
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            />
          </div>
          <button
            className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
            type="submit"
          >
            Connect YouTube
          </button>
        </form>

        {status ? <p className="text-sm text-[var(--brand)]">{status}</p> : null}
      </section>

      <section className="card p-6">
        <p className="label">Connected Providers</p>
        <div className="mt-3 space-y-3">
          {connections.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No providers connected yet.</p>
          ) : (
            connections.map((connection) => (
              <div
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"
              >
                <div>
                  <p className="font-medium">{connection.provider}</p>
                  <p className="text-xs text-[var(--muted)]">
                    status: {connection.status} | last sync:{" "}
                    {connection.lastSyncedAt
                      ? new Date(connection.lastSyncedAt).toLocaleString()
                      : "never"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
                    onClick={() => void syncConnection(connection.id)}
                  >
                    Retry sync
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-rose-200 px-3 py-1 text-sm text-rose-700"
                    onClick={async () => {
                      await fetch("/api/connections", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ provider: connection.provider }),
                      });
                      await load();
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

