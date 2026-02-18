import { Pool, type PoolClient, type QueryResultRow } from "pg";

import { getConfig } from "./config";

let pool: Pool | null = null;

export function getDb(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: getConfig().DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getDb().query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function toPgVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

