import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService.js';
import { getCurrentUser } from '../services/authService.js';
import { logger } from '../logger.js';

export interface AuthLocals {
  userId: string;
  email: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
    return;
  }
  try {
    const payload = verifyToken(token);
    (res.locals as AuthLocals).userId = payload.userId;
    (res.locals as AuthLocals).email = payload.email;
    next();
  } catch {
    logger.debug('Invalid or expired token');
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const { userId } = res.locals as AuthLocals;
  getCurrentUser(userId)
    .then((user) => {
      if (!user || user.role !== 'admin') {
        res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
        return;
      }
      next();
    })
    .catch(next);
}
