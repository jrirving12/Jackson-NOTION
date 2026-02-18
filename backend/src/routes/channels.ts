import { Router, Request, Response } from 'express';
import { requireAuth, AuthLocals } from '../middleware/auth.js';
import * as channelService from '../services/channelService.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth);

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
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'Add member failed');
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
