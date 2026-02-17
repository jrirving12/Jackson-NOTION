import { getPool } from '../db/client.js';

export interface DMThread {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: Date;
}

export interface DMThreadWithOther extends DMThread {
  other_user_id: string;
  other_user_name: string;
  other_user_email: string;
  last_message_at: string | null;
  last_message_preview: string | null;
}

export async function listDMThreadsForUser(userId: string): Promise<DMThreadWithOther[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT t.id, t.user1_id, t.user2_id, t.created_at,
            CASE WHEN t.user1_id = $1 THEN t.user2_id ELSE t.user1_id END AS other_user_id,
            u.name AS other_user_name, u.email AS other_user_email,
            (SELECT m.created_at FROM messages m WHERE m.dm_thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
            (SELECT LEFT(m.body, 60) FROM messages m WHERE m.dm_thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview
     FROM dm_threads t
     JOIN users u ON u.id = CASE WHEN t.user1_id = $1 THEN t.user2_id ELSE t.user1_id END
     WHERE t.user1_id = $1 OR t.user2_id = $1
     ORDER BY last_message_at DESC NULLS LAST, t.created_at DESC`,
    [userId]
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    user1_id: row.user1_id,
    user2_id: row.user2_id,
    created_at: row.created_at,
    other_user_id: row.other_user_id,
    other_user_name: row.other_user_name,
    other_user_email: row.other_user_email,
    last_message_at: row.last_message_at ?? null,
    last_message_preview: row.last_message_preview ?? null,
  })) as DMThreadWithOther[];
}

export async function getOrCreateDMThread(userId: string, otherUserId: string): Promise<DMThread> {
  const pool = getPool();
  const [u1, u2] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  let result = await pool.query(
    'SELECT id, user1_id, user2_id, created_at FROM dm_threads WHERE user1_id = $1 AND user2_id = $2',
    [u1, u2]
  );
  if (result.rows.length > 0) return result.rows[0] as DMThread;
  result = await pool.query(
    `INSERT INTO dm_threads (user1_id, user2_id) VALUES ($1, $2)
     RETURNING id, user1_id, user2_id, created_at`,
    [u1, u2]
  );
  return result.rows[0] as DMThread;
}

export async function getDMThread(threadId: string, userId: string): Promise<DMThreadWithOther | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT t.id, t.user1_id, t.user2_id, t.created_at,
            CASE WHEN t.user1_id = $2 THEN t.user2_id ELSE t.user1_id END AS other_user_id,
            u.name AS other_user_name, u.email AS other_user_email,
            (SELECT m.created_at FROM messages m WHERE m.dm_thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
            (SELECT LEFT(m.body, 60) FROM messages m WHERE m.dm_thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview
     FROM dm_threads t
     JOIN users u ON u.id = CASE WHEN t.user1_id = $2 THEN t.user2_id ELSE t.user1_id END
     WHERE t.id = $1 AND (t.user1_id = $2 OR t.user2_id = $2)`,
    [threadId, userId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: row.id as string,
    user1_id: row.user1_id as string,
    user2_id: row.user2_id as string,
    created_at: row.created_at as Date,
    other_user_id: row.other_user_id as string,
    other_user_name: row.other_user_name as string,
    other_user_email: row.other_user_email as string,
    last_message_at: (row.last_message_at as string) ?? null,
    last_message_preview: (row.last_message_preview as string) ?? null,
  };
}
