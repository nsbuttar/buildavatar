"use client";

import { useEffect, useMemo, useState } from "react";

import { AvatarPanel } from "./avatar-panel";

type Conversation = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
};

type Citation = {
  label: string;
  source: string;
  url?: string | null;
};

function parseSseChunk(chunk: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = chunk.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    const event = lines.find((line) => line.startsWith("event:"))?.replace("event:", "").trim();
    const dataLine = lines.find((line) => line.startsWith("data:"))?.replace("data:", "").trim();
    if (!event || !dataLine) continue;
    try {
      events.push({ event, data: JSON.parse(dataLine) });
    } catch {
      events.push({ event, data: dataLine });
    }
  }
  return events;
}

export function ChatClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [latestAssistantText, setLatestAssistantText] = useState("");
  const [proposedActions, setProposedActions] = useState<string[]>([]);
  const [pendingConfirmationPrompt, setPendingConfirmationPrompt] = useState("");

  const activeConversationTitle = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId)?.title,
    [conversationId, conversations],
  );

  const loadConversations = async () => {
    const response = await fetch("/api/chat/conversations");
    if (!response.ok) return;
    const payload = (await response.json()) as { conversations: Conversation[] };
    setConversations(payload.conversations);
    if (!conversationId && payload.conversations[0]) {
      setConversationId(payload.conversations[0].id);
    }
  };

  const loadMessages = async (id: string) => {
    const response = await fetch(`/api/chat/messages?conversationId=${id}`);
    if (!response.ok) return;
    const payload = (await response.json()) as { messages: Message[] };
    setMessages(payload.messages);
  };

  useEffect(() => {
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void loadMessages(conversationId);
  }, [conversationId]);

  const sendMessage = async (
    confirmedActions?: string[],
    overridePrompt?: string,
  ) => {
    const resolvedPrompt = overridePrompt ?? input;
    if (!resolvedPrompt.trim() || pending) return;
    const userMessage = {
      id: `tmp-user-${Date.now()}`,
      role: "user" as const,
      content: resolvedPrompt,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    const prompt = resolvedPrompt;
    setInput("");
    setPending(true);
    setProposedActions([]);
    setCitations([]);

    if (agentMode) {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          message: prompt,
          agentMode: true,
          confirmedActions,
        }),
      });
      const payload = (await response.json()) as {
        conversationId: string;
        answer: string;
        citations: Citation[];
        proposedActions: string[];
      };
      setConversationId(payload.conversationId);
      setLatestAssistantText(payload.answer);
      setMessages((current) => [
        ...current,
        {
          id: `tmp-assistant-${Date.now()}`,
          role: "assistant",
          content: payload.answer,
          createdAt: new Date().toISOString(),
        },
      ]);
      setCitations(payload.citations ?? []);
      setProposedActions(payload.proposedActions ?? []);
      setPendingConfirmationPrompt(
        payload.proposedActions?.length ? prompt : "",
      );
      setPending(false);
      void loadConversations();
      return;
    }

    const assistantMessageId = `tmp-assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      },
    ]);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        message: prompt,
      }),
    });
    if (!response.body) {
      setPending(false);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    let currentConversationId = conversationId;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const events = parseSseChunk(buffered);
      if (events.length === 0) continue;
      buffered = "";
      for (const event of events) {
        if (event.event === "meta") {
          const data = event.data as { conversationId: string };
          currentConversationId = data.conversationId;
          setConversationId(data.conversationId);
        }
        if (event.event === "token") {
          const data = event.data as { token: string };
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: `${message.content}${data.token}` }
                : message,
            ),
          );
        }
        if (event.event === "done") {
          const data = event.data as { answer: string; citations: Citation[] };
          setLatestAssistantText(data.answer);
          setCitations(data.citations ?? []);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId ? { ...message, content: data.answer } : message,
            ),
          );
          if (currentConversationId) {
            void loadMessages(currentConversationId);
          }
          void loadConversations();
        }
      }
    }
    setPending(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr_340px]">
      <section className="card h-fit p-4">
        <div className="label">Conversations</div>
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--bg)]"
          onClick={async () => {
            const response = await fetch("/api/chat/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: "New conversation" }),
            });
            const payload = (await response.json()) as { conversation: { id: string } };
            setConversationId(payload.conversation.id);
            setMessages([]);
            void loadConversations();
          }}
        >
          New chat
        </button>
        <div className="mt-3 space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                conversationId === conversation.id
                  ? "border-[var(--brand)] bg-[#e7f3ee]"
                  : "border-[var(--line)] bg-white"
              }`}
              onClick={() => setConversationId(conversation.id)}
            >
              <p className="truncate font-medium">
                {conversation.title || "Untitled conversation"}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="card flex min-h-[68vh] flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="label">Chat</p>
            <h2 className="text-xl font-semibold font-[var(--font-title)]">
              {activeConversationTitle || "Avatar conversation"}
            </h2>
          </div>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={agentMode}
                onChange={(event) => setAgentMode(event.target.checked)}
              />
              Agent mode
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={speakEnabled}
                onChange={(event) => setSpeakEnabled(event.target.checked)}
              />
              Speak
            </label>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--line)] p-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                message.role === "user"
                  ? "ml-10 bg-[#e6f3ef]"
                  : "mr-10 bg-[#f9f5f2]"
              }`}
            >
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {message.role}
              </div>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))}
        </div>
        {citations.length > 0 ? (
          <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Citations
            </p>
            <div className="space-y-1 text-sm">
              {citations.map((citation) => (
                <p key={`${citation.label}-${citation.source}`}>
                  <span className="font-medium">{citation.label}</span>: {citation.source}{" "}
                  {citation.url ? (
                    <a
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--brand)] underline"
                    >
                      link
                    </a>
                  ) : null}
                </p>
              ))}
            </div>
          </div>
        ) : null}
        {proposedActions.length > 0 ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium">Agent actions need confirmation.</p>
            <div className="mt-2 space-y-2">
              {proposedActions.map((action) => (
                <div key={action} className="flex items-center justify-between gap-3">
                  <code className="text-xs">{action}</code>
                  <button
                    type="button"
                    className="rounded-lg border border-amber-400 px-3 py-1 text-xs"
                    onClick={() =>
                      void sendMessage([action], pendingConfirmationPrompt)
                    }
                  >
                    Confirm
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask your avatar..."
            className="flex-1 rounded-xl border border-[var(--line)] px-3 py-2"
          />
          <button
            disabled={pending}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 font-medium text-white disabled:opacity-60"
            type="submit"
          >
            {pending ? "Thinking..." : "Send"}
          </button>
        </form>
      </section>

      <AvatarPanel latestText={latestAssistantText} speakEnabled={speakEnabled} />
    </div>
  );
}
