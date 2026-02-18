import type { EmbeddingAdapter, LlmAdapter, VectorStoreAdapter } from "../adapters/interfaces";
import type { ToolCallResult } from "../types/domain";
import { createTask, getKnowledgeDocument } from "./repositories";

export interface AgentToolContext {
  userId: string;
}

export interface AgentTool {
  name: string;
  description: string;
  requiresConfirmation: boolean;
  run: (input: Record<string, unknown>, context: AgentToolContext) => Promise<unknown>;
}

interface PlannerOutput {
  answerIntent: string;
  toolCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    reason: string;
  }>;
}

function parsePlannerOutput(raw: string): PlannerOutput {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.toolCalls)) {
      return { answerIntent: raw, toolCalls: [] };
    }
    return parsed;
  } catch {
    return { answerIntent: raw, toolCalls: [] };
  }
}

export function buildAgentTools(deps: {
  llm: LlmAdapter;
  embeddings: EmbeddingAdapter;
  vectorStore: VectorStoreAdapter;
  getDocumentById?: (input: {
    userId: string;
    knowledgeItemId: string;
  }) => Promise<
    | {
        id: string;
        title: string | null;
        source: string;
        url: string | null;
        text: string;
        chunkCount: number;
        metadata: Record<string, unknown>;
      }
    | null
  >;
  createTaskFn?: (input: {
    userId: string;
    title: string;
    notes?: string;
  }) => Promise<{ id: string; title: string; notes: string | null; createdAt: Date }>;
}): AgentTool[] {
  const getDocumentById = deps.getDocumentById ?? getKnowledgeDocument;
  const createTaskFn = deps.createTaskFn ?? createTask;
  return [
    {
      name: "search_knowledge_base",
      description: "Searches vectorized knowledge items.",
      requiresConfirmation: false,
      run: async (input, context) => {
        const query = String(input.query ?? "");
        const embedding = (await deps.embeddings.embed(query))[0];
        const filters =
          input.filters && typeof input.filters === "object"
            ? (input.filters as Record<string, unknown>)
            : undefined;
        const chunks = await deps.vectorStore.similaritySearch({
          userId: context.userId,
          embedding,
          k: Number(input.k ?? 5),
          filters,
        });
        return { query, chunks };
      },
    },
    {
      name: "get_document",
      description: "Fetches full text and metadata for a specific document by item_id.",
      requiresConfirmation: false,
      run: async (input, context) => {
        const knowledgeItemId = String(input.item_id ?? input.itemId ?? "");
        if (!knowledgeItemId) {
          return { found: false, error: "item_id is required" };
        }
        const document = await getDocumentById({
          userId: context.userId,
          knowledgeItemId,
        });
        if (!document) {
          return { found: false };
        }
        return {
          found: true,
          document,
        };
      },
    },
    {
      name: "summarize",
      description: "Summarizes given text or a document by item_id.",
      requiresConfirmation: false,
      run: async (input, context) => {
        const itemId = String(input.item_id ?? input.itemId ?? "");
        let text = String(input.text ?? "");
        if (!text && itemId) {
          const document = await getDocumentById({
            userId: context.userId,
            knowledgeItemId: itemId,
          });
          text = document?.text ?? "";
        }
        if (!text.trim()) {
          return { summary: "No text found to summarize." };
        }
        const prompt = `Summarize the following in 5 bullet points:\\n\\n${text}`;
        const summary = await deps.llm.complete(prompt, { temperature: 0.2 });
        return { summary };
      },
    },
    {
      name: "draft_email",
      description: "Drafts an email body but never sends anything.",
      requiresConfirmation: false,
      run: async (input) => {
        const context = String(input.context ?? "");
        const tone = String(input.tone ?? "professional");
        const prompt = [
          "Draft an email. Do not include fake signature fields.",
          `Tone: ${tone}`,
          `Context: ${context}`,
        ].join("\n");
        const draft = await deps.llm.complete(prompt, { temperature: 0.4 });
        return { draft };
      },
    },
    {
      name: "create_task",
      description: "Creates an internal task record.",
      requiresConfirmation: true,
      run: async (input, context) => {
        const title = String(input.title ?? "");
        const notes = input.notes ? String(input.notes) : undefined;
        const task = await createTaskFn({
          userId: context.userId,
          title,
          notes,
        });
        return task;
      },
    },
  ];
}

export async function runAgent(
  deps: {
    llm: LlmAdapter;
    embeddings: EmbeddingAdapter;
    vectorStore: VectorStoreAdapter;
    getDocumentById?: (input: {
      userId: string;
      knowledgeItemId: string;
    }) => Promise<
      | {
          id: string;
          title: string | null;
          source: string;
          url: string | null;
          text: string;
          chunkCount: number;
          metadata: Record<string, unknown>;
        }
      | null
    >;
    createTaskFn?: (input: {
      userId: string;
      title: string;
      notes?: string;
    }) => Promise<{ id: string; title: string; notes: string | null; createdAt: Date }>;
  },
  input: {
    userId: string;
    query: string;
    confirmedActions?: string[];
  },
): Promise<{
  response: string;
  toolResults: ToolCallResult[];
  proposedActions: string[];
}> {
  const tools = buildAgentTools(deps);
  const catalog = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    requiresConfirmation: tool.requiresConfirmation,
  }));

  const plannerPrompt = [
    "You are an agent planner for Avatar OS.",
    "Return JSON with keys: answerIntent, toolCalls[] where each item has toolName, args, reason.",
    "Tool arg hints:",
    "- search_knowledge_base: { query, k?, filters? }",
    "- get_document: { item_id }",
    "- summarize: { text } or { item_id }",
    "- draft_email: { context, tone? }",
    "- create_task: { title, notes? }",
    "Only pick tools from this catalog.",
    JSON.stringify(catalog),
    `User request: ${input.query}`,
  ].join("\n\n");
  const plannerRaw = await deps.llm.complete(plannerPrompt, { temperature: 0.2 });
  const plan = parsePlannerOutput(plannerRaw);

  const results: ToolCallResult[] = [];
  const proposedActions: string[] = [];

  for (const call of plan.toolCalls) {
    const tool = tools.find((entry) => entry.name === call.toolName);
    if (!tool) continue;
    if (tool.requiresConfirmation) {
      const key = `${call.toolName}:${JSON.stringify(call.args)}`;
      proposedActions.push(key);
      if (!input.confirmedActions?.includes(key)) {
        results.push({
          toolName: call.toolName,
          input: call.args,
          output: "Awaiting user confirmation",
        });
        continue;
      }
    }
    const output = await tool.run(call.args, { userId: input.userId });
    results.push({
      toolName: call.toolName,
      input: call.args,
      output: (output ?? {}) as Record<string, unknown>,
    });
  }

  const finalPrompt = [
    "Generate the final assistant response using the agent plan and tool results.",
    "If any actions are pending confirmation, ask the user to confirm before execution.",
    `User request: ${input.query}`,
    `Plan intent: ${plan.answerIntent}`,
    `Tool results: ${JSON.stringify(results)}`,
  ].join("\n\n");

  const response = await deps.llm.complete(finalPrompt, { temperature: 0.3 });
  return {
    response,
    toolResults: results,
    proposedActions,
  };
}
