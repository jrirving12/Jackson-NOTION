import { Router, Request, Response } from 'express';
import { requireAuth, AuthLocals } from '../middleware/auth.js';
import * as dmService from '../services/dmService.js';
import { getPool } from '../db/client.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth);

router.get('/threads', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  try {
    const threads = await dmService.listDMThreadsForUser(userId);
    res.json({ threads });
  } catch (err) {
    logger.error({ err }, 'List DM threads failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/threads/:threadId', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const thread = await dmService.getDMThread(req.params.threadId, userId);
  if (!thread) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(thread);
});

router.post('/threads', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { other_user_id: otherUserId } = req.body as { other_user_id?: string };
  if (!otherUserId) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'other_user_id required' });
    return;
  }
  if (otherUserId === userId) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cannot start DM with yourself' });
    return;
  }
  const pool = getPool();
  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [otherUserId]);
  if (userCheck.rows.length === 0) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
    return;
  }
  try {
    const thread = await dmService.getOrCreateDMThread(userId, otherUserId);
    res.status(201).json(thread);
  } catch (err) {
    logger.error({ err }, 'Get or create DM thread failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
