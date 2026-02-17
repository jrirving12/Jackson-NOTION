import { Router, Request, Response } from 'express';
import { getPool } from '../db/client.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const dbOk = await checkDb();
  const status = dbOk ? 'ok' : 'degraded';
  const statusCode = dbOk ? 200 : 503;
  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    database: dbOk ? 'connected' : 'disconnected',
  });
});

async function checkDb(): Promise<boolean> {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.warn({ err }, 'Health check: DB unreachable (is DATABASE_URL set?)');
    return false;
  }
}

export default router;
