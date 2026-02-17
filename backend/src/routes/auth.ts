import { Router, Request, Response } from 'express';
import { requireAuth, AuthLocals } from '../middleware/auth.js';
import * as authService from '../services/authService.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const { userId } = res.locals as AuthLocals;
  const user = await authService.getCurrentUser(userId);
  if (!user) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      assigned_region_id: user.assigned_region_id,
      created_at: user.created_at,
    },
  });
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, role } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      role?: authService.UserRole;
    };
    if (!email || !password || !name) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'email, password, and name are required',
      });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Password must be at least 8 characters',
      });
      return;
    }
    const user = await authService.register({ email, password, name, role });
    const { token } = await authService.login(email, password);
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        assigned_region_id: user.assigned_region_id,
        created_at: user.created_at,
      },
      token,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_IN_USE') {
      res.status(409).json({ error: 'EMAIL_IN_USE', message: 'Email already registered' });
      return;
    }
    logger.error({ err }, 'Register failed');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Registration failed' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'email and password are required',
      });
      return;
    }
    const result = await authService.login(email, password);
    res.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        assigned_region_id: result.user.assigned_region_id,
        created_at: result.user.created_at,
      },
      token: result.token,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      return;
    }
    logger.error({ err }, 'Login failed');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed' });
  }
});

export default router;
