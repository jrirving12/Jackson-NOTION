import { getPool } from '../db/client.js';

export interface Message {
  id: string;
  sender_id: string;
  body: string;
  type: string;
  image_url: string | null;
  created_at: Date;
  channel_id: string | null;
  dm_thread_id: string | null;
}

export interface MessageWithSender extends Message {
  sender_name: string;
  sender_email: string;
}

const PAGE_SIZE = 50;

export async function getChannelMessages(
  channelId: string,
  userId: string,
  before?: string
): Promise<MessageWithSender[]> {
  const pool = getPool();
  const memberCheck = await pool.query(
    'SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2',
    [channelId, userId]
  );
  if (memberCheck.rows.length === 0) return [];

  let query = `
    SELECT m.id, m.sender_id, m.body, m.type, m.image_url, m.created_at, m.channel_id, m.dm_thread_id,
           u.name AS sender_name, u.email AS sender_email
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.channel_id = $1
  `;
  const params: unknown[] = [channelId];
  if (before) {
    params.push(before);
    query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)`;
  }
  query += ` ORDER BY m.created_at DESC LIMIT ${PAGE_SIZE + 1}`;
  const result = await pool.query(query, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  return rows.map(mapMessageRow).reverse();
}

export async function getDMMessages(
  dmThreadId: string,
  userId: string,
  before?: string
): Promise<MessageWithSender[]> {
  const pool = getPool();
  const threadCheck = await pool.query(
    'SELECT 1 FROM dm_threads WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
    [dmThreadId, userId]
  );
  if (threadCheck.rows.length === 0) return [];

  let query = `
    SELECT m.id, m.sender_id, m.body, m.type, m.image_url, m.created_at, m.channel_id, m.dm_thread_id,
           u.name AS sender_name, u.email AS sender_email
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.dm_thread_id = $1
  `;
  const params: unknown[] = [dmThreadId];
  if (before) {
    params.push(before);
    query += ` AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)`;
  }
  query += ` ORDER BY m.created_at DESC LIMIT ${PAGE_SIZE + 1}`;
  const result = await pool.query(query, params);
  const rows = result.rows.slice(0, PAGE_SIZE);
  return rows.map(mapMessageRow).reverse();
}

export async function sendChannelMessage(
  channelId: string,
  senderId: string,
  body: string,
  imageUrl?: string | null
): Promise<MessageWithSender> {
  const pool = getPool();
  const memberCheck = await pool.query(
    'SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2',
    [channelId, senderId]
  );
  if (memberCheck.rows.length === 0) throw new Error('NOT_MEMBER');

  const result = await pool.query(
    `INSERT INTO messages (channel_id, sender_id, body, type, image_url) VALUES ($1, $2, $3, 'message', $4)
     RETURNING id, sender_id, body, type, image_url, created_at, channel_id, dm_thread_id`,
    [channelId, senderId, body.trim(), imageUrl || null]
  );
  const row = result.rows[0];
  const userRow = await pool.query('SELECT name, email FROM users WHERE id = $1', [senderId]);
  return mapMessageRow({
    ...row,
    sender_name: userRow.rows[0]?.name ?? '',
    sender_email: userRow.rows[0]?.email ?? '',
  });
}

export async function sendDMMessage(
  dmThreadId: string,
  senderId: string,
  body: string,
  imageUrl?: string | null
): Promise<MessageWithSender> {
  const pool = getPool();
  const threadCheck = await pool.query(
    'SELECT 1 FROM dm_threads WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
    [dmThreadId, senderId]
  );
  if (threadCheck.rows.length === 0) throw new Error('NOT_IN_THREAD');

  const result = await pool.query(
    `INSERT INTO messages (dm_thread_id, sender_id, body, type, image_url) VALUES ($1, $2, $3, 'message', $4)
     RETURNING id, sender_id, body, type, image_url, created_at, channel_id, dm_thread_id`,
    [dmThreadId, senderId, body.trim(), imageUrl || null]
  );
  const row = result.rows[0];
  const userRow = await pool.query('SELECT name, email FROM users WHERE id = $1', [senderId]);
  return mapMessageRow({
    ...row,
    sender_name: userRow.rows[0]?.name ?? '',
    sender_email: userRow.rows[0]?.email ?? '',
  });
}

export async function sendSystemMessage(
  channelId: string,
  actorId: string,
  body: string
): Promise<MessageWithSender> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO messages (channel_id, sender_id, body, type) VALUES ($1, $2, $3, 'system')
     RETURNING id, sender_id, body, type, created_at, channel_id, dm_thread_id`,
    [channelId, actorId, body]
  );
  const row = result.rows[0];
  const userRow = await pool.query('SELECT name, email FROM users WHERE id = $1', [actorId]);
  return mapMessageRow({
    ...row,
    sender_name: userRow.rows[0]?.name ?? '',
    sender_email: userRow.rows[0]?.email ?? '',
  });
}

function mapMessageRow(row: Record<string, unknown>): MessageWithSender {
  return {
    id: row.id as string,
    sender_id: row.sender_id as string,
    body: row.body as string,
    type: (row.type as string) ?? 'message',
    image_url: (row.image_url as string) ?? null,
    created_at: row.created_at as Date,
    channel_id: (row.channel_id as string) ?? null,
    dm_thread_id: (row.dm_thread_id as string) ?? null,
    sender_name: (row.sender_name as string) ?? '',
    sender_email: (row.sender_email as string) ?? '',
  };
}
