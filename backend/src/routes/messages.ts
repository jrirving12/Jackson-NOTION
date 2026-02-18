import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { requireAuth, AuthLocals } from '../middleware/auth.js';
import * as messageService from '../services/messageService.js';
import { emitChannelMessage, emitDMMessage, emitToUser } from '../socket.js';
import { getPool } from '../db/client.js';
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
    if (io) {
      emitChannelMessage(io, channelId, message);
      notifyChannelMembers(io, channelId, userId, message);
    }
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
    if (io) {
      emitDMMessage(io, threadId, message);
      notifyDMParticipants(io, threadId, userId, message);
    }
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

async function notifyChannelMembers(io: Server, channelId: string, senderId: string, message: unknown) {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT user_id FROM channel_members WHERE channel_id = $1',
      [channelId]
    );
    for (const row of result.rows) {
      const memberId = row.user_id as string;
      emitToUser(io, memberId, 'conversation_update', {
        type: 'channel',
        id: channelId,
        senderId,
        message,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to notify channel members');
  }
}

async function notifyDMParticipants(io: Server, threadId: string, senderId: string, message: unknown) {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT user1_id, user2_id FROM dm_threads WHERE id = $1',
      [threadId]
    );
    if (result.rows.length > 0) {
      const { user1_id, user2_id } = result.rows[0];
      emitToUser(io, user1_id as string, 'conversation_update', {
        type: 'dm',
        id: threadId,
        senderId,
        message,
      });
      emitToUser(io, user2_id as string, 'conversation_update', {
        type: 'dm',
        id: threadId,
        senderId,
        message,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to notify DM participants');
  }
}

export default router;
