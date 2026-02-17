#!/usr/bin/env node
/**
 * Run schema.sql against DATABASE_URL.
 * Usage: npm run db:migrate   (requires DATABASE_URL in .env)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPool } from './client.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'schema.sql');

async function main() {
  const config = getConfig();
  if (!config.databaseUrl) {
    logger.error('DATABASE_URL is not set. Cannot run migrations.');
    process.exit(1);
  }
  const sql = readFileSync(schemaPath, 'utf-8');
  const pool = getPool();
  try {
    await pool.query(sql);
    logger.info('Schema applied successfully.');
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
