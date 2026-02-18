import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getPool } from '../db/client.js';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

const SALT_ROUNDS = 10;

export type UserRole = 'rep' | 'manager' | 'admin';
export type UserStatus = 'pending_approval' | 'active' | 'rejected';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  assigned_region_id: string | null;
  created_at: Date;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface LoginResult {
  user: Omit<User, 'assigned_region_id'> & { assigned_region_id: string | null };
  token: string;
}

export async function register(input: RegisterInput): Promise<User> {
  const pool = getPool();
  const existing = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [input.email]
  );
  if (existing.rows.length > 0) {
    throw new Error('EMAIL_IN_USE');
  }
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const role = input.role ?? 'rep';
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, status)
     VALUES ($1, $2, $3, $4, 'pending_approval')
     RETURNING id, email, name, role, status, assigned_region_id, created_at`,
    [input.email.trim().toLowerCase(), passwordHash, input.name.trim(), role]
  );
  const row = result.rows[0];
  logger.info({ userId: row.id, email: row.email }, 'User registered');
  return mapRowToUser(row);
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, email, name, role, status, assigned_region_id, created_at, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
    [email.trim()]
  );
  if (result.rows.length === 0) {
    throw new Error('INVALID_CREDENTIALS');
  }
  const row = result.rows[0];
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }
  const status = (row.status as string) ?? 'active';
  if (status !== 'active') {
    throw new Error(status === 'pending_approval' ? 'PENDING_APPROVAL' : 'ACCOUNT_REJECTED');
  }
  const user = mapRowToUser(row);
  const config = getConfig();
  const token = jwt.sign(
    { sub: user.id, email: user.email },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
  logger.info({ userId: user.id }, 'User logged in');
  return { user, token };
}

function mapRowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as UserRole,
    status: ((row.status as string) ?? 'active') as UserStatus,
    assigned_region_id: (row.assigned_region_id as string) ?? null,
    created_at: row.created_at as Date,
  };
}

export function verifyToken(token: string): { userId: string; email: string } {
  const config = getConfig();
  const decoded = jwt.verify(token, config.jwtSecret) as { sub: string; email: string };
  return { userId: decoded.sub, email: decoded.email };
}

export async function getCurrentUser(userId: string): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, email, name, role, status, assigned_region_id, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) return null;
  return mapRowToUser(result.rows[0]);
}

export async function listPendingUsers(): Promise<User[]> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, email, name, role, status, assigned_region_id, created_at FROM users WHERE status = $1 ORDER BY created_at ASC',
    ['pending_approval']
  );
  return result.rows.map((row) => mapRowToUser(row));
}

export async function setUserStatus(userId: string, status: UserStatus): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE users SET status = $1, updated_at = now()
     WHERE id = $2 RETURNING id, email, name, role, status, assigned_region_id, created_at`,
    [status, userId]
  );
  if (result.rows.length === 0) return null;
  const user = mapRowToUser(result.rows[0]);
  logger.info({ userId, status }, 'User status updated');
  return user;
}
