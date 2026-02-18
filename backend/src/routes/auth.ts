import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin, AuthLocals } from '../middleware/auth.js';
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
      status: user.status,
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
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        assigned_region_id: user.assigned_region_id,
        created_at: user.created_at,
      },
      message: 'Account created. An admin must approve your account before you can sign in.',
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
        status: result.user.status,
        assigned_region_id: result.user.assigned_region_id,
        created_at: result.user.created_at,
      },
      token: result.token,
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'INVALID_CREDENTIALS') {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
        return;
      }
      if (err.message === 'PENDING_APPROVAL') {
        res.status(403).json({
          error: 'PENDING_APPROVAL',
          message: 'Your account is pending admin approval. You will be able to sign in once approved.',
        });
        return;
      }
      if (err.message === 'ACCOUNT_REJECTED') {
        res.status(403).json({
          error: 'ACCOUNT_REJECTED',
          message: 'Your account was not approved. Contact an administrator.',
        });
        return;
      }
    }
    logger.error({ err }, 'Login failed');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed' });
  }
});

router.get('/pending', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await authService.listPendingUsers();
    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        created_at: u.created_at,
      })),
    });
  } catch (err) {
    logger.error({ err }, 'List pending users failed');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list pending users' });
  }
});

router.post('/approve', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'userId required' });
      return;
    }
    const user = await authService.setUserStatus(userId, 'active');
    if (!user) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Approve user failed');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to approve user' });
  }
});

router.post('/reject', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'userId required' });
      return;
    }
    const user = await authService.setUserStatus(userId, 'rejected');
    if (!user) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Reject user failed');
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to reject user' });
  }
});

export default router;
