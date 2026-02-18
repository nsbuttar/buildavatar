"use client";

import { useEffect, useState } from "react";

type Connection = {
  id: string;
  provider: string;
  status: string;
  lastSyncedAt: string | null;
  scopes: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
};

type LlmProvider = "openai" | "gemini";

const syncableProviders = new Set(["github", "youtube", "x"]);
const llmProviders = new Set(["openai", "gemini"]);

const defaultLlmModels: Record<LlmProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
};

export function ConnectionsPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [githubToken, setGithubToken] = useState("");
  const [youtubeApiKey, setYoutubeApiKey] = useState("");
  const [youtubeChannelId, setYoutubeChannelId] = useState("");
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [openAiModel, setOpenAiModel] = useState(defaultLlmModels.openai);
  const [openAiSetDefault, setOpenAiSetDefault] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState(defaultLlmModels.gemini);
  const [geminiSetDefault, setGeminiSetDefault] = useState(true);
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

  const connectLlm = async (input: {
    provider: LlmProvider;
    apiKey: string;
    model: string;
    setDefault: boolean;
  }) => {
    setStatus("");
    const model = input.model.trim();
    const response = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        model: model || undefined,
      }),
    });
    if (!response.ok) {
      setStatus(`Failed to connect ${input.provider}.`);
      return;
    }
    setStatus(`${input.provider} connected.`);
    await load();
  };

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-6">
        <div>
          <p className="label">Connections</p>
          <h1 className="text-3xl font-semibold font-[var(--font-title)]">
            Connect your data and model providers
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Tokens are encrypted at rest. Disconnecting removes associated retrieval data.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="rounded-xl border border-[var(--line)] bg-white p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await connectLlm({
                provider: "openai",
                apiKey: openAiApiKey,
                model: openAiModel,
                setDefault: openAiSetDefault,
              });
              setOpenAiApiKey("");
            }}
          >
            <h2 className="text-lg font-semibold">OpenAI (LLM)</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Connect your OpenAI key for chat generation.
            </p>
            <div className="mt-3 grid gap-3">
              <input
                value={openAiApiKey}
                onChange={(event) => setOpenAiApiKey(event.target.value)}
                placeholder="OpenAI API key"
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                required
              />
              <input
                value={openAiModel}
                onChange={(event) => setOpenAiModel(event.target.value)}
                placeholder={defaultLlmModels.openai}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={openAiSetDefault}
                  onChange={(event) => setOpenAiSetDefault(event.target.checked)}
                />
                Set as default chat provider
              </label>
            </div>
            <button
              className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              Connect OpenAI
            </button>
          </form>

          <form
            className="rounded-xl border border-[var(--line)] bg-white p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await connectLlm({
                provider: "gemini",
                apiKey: geminiApiKey,
                model: geminiModel,
                setDefault: geminiSetDefault,
              });
              setGeminiApiKey("");
            }}
          >
            <h2 className="text-lg font-semibold">Google Gemini (LLM)</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Connect your Gemini API key for chat generation.
            </p>
            <div className="mt-3 grid gap-3">
              <input
                value={geminiApiKey}
                onChange={(event) => setGeminiApiKey(event.target.value)}
                placeholder="Gemini API key"
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                required
              />
              <input
                value={geminiModel}
                onChange={(event) => setGeminiModel(event.target.value)}
                placeholder={defaultLlmModels.gemini}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={geminiSetDefault}
                  onChange={(event) => setGeminiSetDefault(event.target.checked)}
                />
                Set as default chat provider
              </label>
            </div>
            <button
              className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              Connect Gemini
            </button>
          </form>
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
            connections.map((connection) => {
              const isLlmProvider = llmProviders.has(connection.provider);
              const isDefaultLlm = isLlmProvider && connection.metadata?.isDefault === true;
              const modelName =
                typeof connection.metadata?.model === "string"
                  ? connection.metadata.model
                  : null;
              return (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {connection.provider}
                      {isDefaultLlm ? " (default LLM)" : ""}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      status: {connection.status} | last sync:{" "}
                      {connection.lastSyncedAt
                        ? new Date(connection.lastSyncedAt).toLocaleString()
                        : "never"}
                    </p>
                    {modelName ? (
                      <p className="text-xs text-[var(--muted)]">model: {modelName}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {syncableProviders.has(connection.provider) ? (
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
                        onClick={() => void syncConnection(connection.id)}
                      >
                        Retry sync
                      </button>
                    ) : null}
                    {isLlmProvider &&
                    connection.status === "connected" &&
                    !isDefaultLlm ? (
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--line)] px-3 py-1 text-sm"
                        onClick={async () => {
                          const response = await fetch("/api/connections", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ provider: connection.provider }),
                          });
                          if (response.ok) {
                            setStatus(`${connection.provider} is now default.`);
                            await load();
                          } else {
                            setStatus(`Failed to set ${connection.provider} as default.`);
                          }
                        }}
                      >
                        Set default
                      </button>
                    ) : null}
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
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
