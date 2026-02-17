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
  const { name, type } = req.body as { name?: string; type?: channelService.ChannelType };
  if (!name || !type) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name and type required' });
    return;
  }
  try {
    const channel = await channelService.createChannel(name, type, userId);
    res.status(201).json(channel);
  } catch (err) {
    logger.error({ err }, 'Create channel failed');
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

export default router;
