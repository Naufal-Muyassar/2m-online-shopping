import { Pool, type PoolClient } from "pg";
import { env } from "../config/env";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export type Tx = PoolClient;

export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
