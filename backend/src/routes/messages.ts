import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { requireAuth, AuthLocals } from '../middleware/auth.js';
import * as messageService from '../services/messageService.js';
import { emitChannelMessage, emitDMMessage } from '../socket.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth);

router.get('/channel/:channelId', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { channelId } = req.params;
  const before = req.query.before as string | undefined;
  try {
    const messages = await messageService.getChannelMessages(channelId, userId, before);
    res.json({ messages });
  } catch (err) {
    logger.error({ err }, 'Get channel messages failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/channel/:channelId', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { channelId } = req.params;
  const { body } = req.body as { body?: string };
  if (!body || typeof body !== 'string') {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'body required' });
    return;
  }
  try {
    const message = await messageService.sendChannelMessage(channelId, userId, body);
    const io = req.app.get('io') as Server;
    if (io) emitChannelMessage(io, channelId, message);
    res.status(201).json(message);
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_MEMBER') {
      res.status(403).json({ error: 'NOT_MEMBER' });
      return;
    }
    logger.error({ err }, 'Send channel message failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/dm/:threadId', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { threadId } = req.params;
  const before = req.query.before as string | undefined;
  try {
    const messages = await messageService.getDMMessages(threadId, userId, before);
    res.json({ messages });
  } catch (err) {
    logger.error({ err }, 'Get DM messages failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/dm/:threadId', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { threadId } = req.params;
  const { body } = req.body as { body?: string };
  if (!body || typeof body !== 'string') {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'body required' });
    return;
  }
  try {
    const message = await messageService.sendDMMessage(threadId, userId, body);
    const io = req.app.get('io') as Server;
    if (io) emitDMMessage(io, threadId, message);
    res.status(201).json(message);
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_IN_THREAD') {
      res.status(403).json({ error: 'NOT_IN_THREAD' });
      return;
    }
    logger.error({ err }, 'Send DM message failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
