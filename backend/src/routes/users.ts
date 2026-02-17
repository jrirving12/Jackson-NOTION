import { Router, Request, Response } from 'express';
import { requireAuth, AuthLocals } from '../middleware/auth.js';
import { getPool } from '../db/client.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, name, email FROM users WHERE id != $1 ORDER BY name',
      [userId]
    );
    res.json({ users: result.rows });
  } catch (err) {
    logger.error({ err }, 'List users failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
