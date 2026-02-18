import { ensureUser, upsertMemory } from "../packages/core/src/services/repositories";
import { getEmbeddingAdapter } from "../packages/core/src/factory";

async function run(): Promise<void> {
  const user = await ensureUser({
    email: "demo@avataros.local",
    name: "Demo User",
  });
  const embeddingAdapter = getEmbeddingAdapter();
  const seedMemories = [
    { type: "fact" as const, content: "I am building Avatar OS with modular adapters." },
    { type: "preference" as const, content: "I prefer concise, factual explanations." },
    { type: "project" as const, content: "Current project: ship Avatar OS MVP." },
  ];

  for (const memory of seedMemories) {
    const embedding = (await embeddingAdapter.embed(memory.content))[0];
    await upsertMemory({
      userId: user.id,
      type: memory.type,
      content: memory.content,
      confidence: 0.9,
      sourceRefs: { source: "seed" },
      embedding,
    });
  }
  console.log(`Seeded user ${user.email} (${user.id})`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

