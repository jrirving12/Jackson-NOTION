import pg from 'pg';
import { getConfig } from '../config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = getConfig().databaseUrl;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set. Add it to .env (see .env.example).');
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
