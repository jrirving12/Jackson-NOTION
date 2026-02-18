#!/usr/bin/env node
/**
 * Run schema.sql then migrations against DATABASE_URL.
 * Usage: npm run db:migrate   (requires DATABASE_URL in .env)
 */
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPool } from './client.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema.sql');
const migrationsDir = join(__dirname, 'migrations');

async function main() {
  const config = getConfig();
  if (!config.databaseUrl) {
    logger.error('DATABASE_URL is not set. Cannot run migrations.');
    process.exit(1);
  }
  const pool = getPool();
  try {
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    await pool.query(schemaSql);
    logger.info('Schema applied successfully.');

    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = readFileSync(join(migrationsDir, f), 'utf-8');
      await pool.query(sql);
      logger.info({ file: f }, 'Migration applied.');
    }
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
