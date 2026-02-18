import { getPool } from '../db/client.js';

export type ChannelType = 'producer_group' | 'account_group' | 'shipping_group' | 'general';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  created_at: Date;
  created_by: string | null;
}

export interface ChannelWithLastMessage extends Channel {
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
}

export async function listChannelsForUser(userId: string): Promise<ChannelWithLastMessage[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT c.id, c.name, c.type, c.created_at, c.created_by,
            (SELECT m.created_at FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
            (SELECT LEFT(m.body, 60) FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
            (SELECT m.sender_id FROM messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_sender_id
     FROM channels c
     INNER JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $1
     ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC`,
    [userId]
  );
  return result.rows.map(mapChannelRow);
}

export async function getChannel(channelId: string, userId: string): Promise<Channel | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT c.id, c.name, c.type, c.created_at, c.created_by
     FROM channels c
     INNER JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
     WHERE c.id = $1`,
    [channelId, userId]
  );
  if (result.rows.length === 0) return null;
  return mapChannelRow(result.rows[0]);
}

export async function createChannel(
  name: string,
  type: ChannelType,
  createdBy: string
): Promise<Channel> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ch = await client.query(
      `INSERT INTO channels (name, type, created_by) VALUES ($1, $2, $3)
       RETURNING id, name, type, created_at, created_by`,
      [name.trim(), type, createdBy]
    );
    await client.query(
      'INSERT INTO channel_members (channel_id, user_id, role) VALUES ($1, $2, $3)',
      [ch.rows[0].id, createdBy, 'admin']
    );
    await client.query('COMMIT');
    return mapChannelRow(ch.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function addMemberToChannel(
  channelId: string,
  userId: string,
  addedBy: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO channel_members (channel_id, user_id, role)
     SELECT $1, $2, 'member' WHERE EXISTS (SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $3)`,
    [channelId, userId, addedBy]
  );
}

export interface ChannelMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  joined_at: string;
}

export async function getChannelMembers(channelId: string, userId: string): Promise<ChannelMember[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT u.id AS user_id, u.name, u.email, cm.role, cm.joined_at
     FROM channel_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.channel_id = $1
       AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2)
     ORDER BY cm.role DESC, u.name ASC`,
    [channelId, userId]
  );
  return result.rows as ChannelMember[];
}

export async function renameChannel(channelId: string, name: string, userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE channels SET name = $1
     WHERE id = $2
       AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id = $2 AND user_id = $3 AND role = 'admin')`,
    [name.trim(), channelId, userId]
  );
}

export async function removeMemberFromChannel(channelId: string, memberId: string, userId: string): Promise<void> {
  const pool = getPool();
  const isAdmin = await pool.query(
    "SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2 AND role = 'admin'",
    [channelId, userId]
  );
  if (isAdmin.rows.length === 0) throw new Error('NOT_ADMIN');
  if (memberId === userId) throw new Error('CANNOT_REMOVE_SELF');
  await pool.query(
    'DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2',
    [channelId, memberId]
  );
}

function mapChannelRow(row: Record<string, unknown>): ChannelWithLastMessage {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as ChannelType,
    created_at: row.created_at as Date,
    created_by: (row.created_by as string) ?? null,
    last_message_at: (row.last_message_at as string) ?? null,
    last_message_preview: (row.last_message_preview as string) ?? null,
    last_message_sender_id: (row.last_message_sender_id as string) ?? null,
  };
}
