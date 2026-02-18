import fs from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

const migrationsDir = path.resolve(process.cwd(), "db", "migrations");

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }
  const pool = new Pool({
    connectionString: databaseUrl,
  });
  try {
    await pool.query(
      `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
      `,
    );
    const applied = await pool.query<{ id: string }>(`SELECT id FROM schema_migrations`);
    const appliedSet = new Set(applied.rows.map((row) => row.id));

    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file]);
        await pool.query("COMMIT");
        console.log(`Applied migration: ${file}`);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

