import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { requireAuth, AuthLocals } from '../middleware/auth.js';
import * as channelService from '../services/channelService.js';
import * as messageService from '../services/messageService.js';
import { emitChannelMessage, emitToUser } from '../socket.js';
import { getPool } from '../db/client.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth);

async function getUserName(userId: string): Promise<string> {
  const pool = getPool();
  const result = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.name ?? 'Someone';
}

router.get('/', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  try {
    const channels = await channelService.listChannelsForUser(userId);
    res.json({ channels });
  } catch (err) {
    logger.error({ err }, 'List channels failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { name, type, memberIds } = req.body as {
    name?: string;
    type?: channelService.ChannelType;
    memberIds?: string[];
  };
  if (!name || !type) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name and type required' });
    return;
  }
  try {
    const channel = await channelService.createChannel(name, type, userId);
    if (memberIds && memberIds.length > 0) {
      for (const memberId of memberIds) {
        if (memberId !== userId) {
          await channelService.addMemberToChannel(channel.id, memberId, userId);
        }
      }
    }
    res.status(201).json(channel);
  } catch (err) {
    logger.error({ err }, 'Create channel failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.post('/:id/members', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { memberId } = req.body as { memberId?: string };
  if (!memberId) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'memberId required' });
    return;
  }
  try {
    await channelService.addMemberToChannel(req.params.id, memberId, userId);
    const [actorName, addedName] = await Promise.all([getUserName(userId), getUserName(memberId)]);
    const sysMsg = await messageService.sendSystemMessage(req.params.id, userId, `${actorName} added ${addedName} to the channel`);
    const io = req.app.get('io') as Server;
    if (io) emitChannelMessage(io, req.params.id, sysMsg);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Add member failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name required' });
    return;
  }
  try {
    await channelService.renameChannel(req.params.id, name, userId);
    const actorName = await getUserName(userId);
    const sysMsg = await messageService.sendSystemMessage(req.params.id, userId, `${actorName} renamed the channel to "${name.trim()}"`);
    const io = req.app.get('io') as Server;
    if (io) {
      emitChannelMessage(io, req.params.id, sysMsg);
      const pool = getPool();
      const membersResult = await pool.query(
        'SELECT user_id FROM channel_members WHERE channel_id = $1',
        [req.params.id]
      );
      for (const row of membersResult.rows) {
        emitToUser(io, row.user_id as string, 'channel_renamed', {
          channelId: req.params.id,
          name: name.trim(),
        });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Rename channel failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.delete('/:id/members/:memberId', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  try {
    const removedName = await getUserName(req.params.memberId);
    await channelService.removeMemberFromChannel(req.params.id, req.params.memberId, userId);
    const actorName = await getUserName(userId);
    const sysMsg = await messageService.sendSystemMessage(req.params.id, userId, `${actorName} removed ${removedName} from the channel`);
    const io = req.app.get('io') as Server;
    if (io) emitChannelMessage(io, req.params.id, sysMsg);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_ADMIN') {
      res.status(403).json({ error: 'NOT_ADMIN', message: 'Only admins can remove members' });
      return;
    }
    if (err instanceof Error && err.message === 'CANNOT_REMOVE_SELF') {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Cannot remove yourself' });
      return;
    }
    logger.error({ err }, 'Remove member failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const channel = await channelService.getChannel(req.params.id, userId);
  if (!channel) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(channel);
});

router.get('/:id/members', async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  try {
    const members = await channelService.getChannelMembers(req.params.id, userId);
    res.json({ members });
  } catch (err) {
    logger.error({ err }, 'Get channel members failed');
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
