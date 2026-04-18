import { getPool } from '../db/client.js';

// Structured attachments carried on a message. `twenty_record` is the
// primary "CRM-native" shape: a reference to a Twenty object record that
// the web UI renders as a clickable card. `link` / `file` are open-ended
// future shapes.
export type MessageAttachment =
  | {
      type: 'twenty_record';
      objectName: string;
      id: string;
      label: string;
      subtitle?: string | null;
      avatarUrl?: string | null;
      url?: string | null;
    }
  | {
      type: 'link';
      url: string;
      label?: string | null;
      description?: string | null;
      imageUrl?: string | null;
    }
  | {
      type: 'file';
      url: string;
      name: string;
      mimeType?: string | null;
      sizeBytes?: number | null;
    };

export interface Message {
  id: string;
  sender_id: string;
  body: string;
  type: string;
  image_url: string | null;
  attachments: MessageAttachment[];
  created_at: Date;
  channel_id: string | null;
  dm_thread_id: string | null;
}

export interface MessageWithSender extends Message {
  sender_name: string;
  sender_email: string;
}

const PAGE_SIZE = 50;

const MESSAGE_COLUMNS = `m.id, m.sender_id, m.body, m.type, m.image_url, m.attachments, m.created_at, m.channel_id, m.dm_thread_id`;

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
    SELECT ${MESSAGE_COLUMNS},
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
    SELECT ${MESSAGE_COLUMNS},
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

export interface SendMessageInput {
  body?: string;
  imageUrl?: string | null;
  attachments?: MessageAttachment[];
}

export async function sendChannelMessage(
  channelId: string,
  senderId: string,
  input: SendMessageInput
): Promise<MessageWithSender> {
  const pool = getPool();
  const memberCheck = await pool.query(
    'SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2',
    [channelId, senderId]
  );
  if (memberCheck.rows.length === 0) throw new Error('NOT_MEMBER');

  const { body, imageUrl, attachments } = normalizeInput(input);

  const result = await pool.query(
    `INSERT INTO messages (channel_id, sender_id, body, type, image_url, attachments)
     VALUES ($1, $2, $3, 'message', $4, $5::jsonb)
     RETURNING ${columnsWithoutPrefix()}`,
    [channelId, senderId, body, imageUrl, JSON.stringify(attachments)]
  );
  return hydrateSender(result.rows[0], senderId);
}

export async function sendDMMessage(
  dmThreadId: string,
  senderId: string,
  input: SendMessageInput
): Promise<MessageWithSender> {
  const pool = getPool();
  const threadCheck = await pool.query(
    'SELECT 1 FROM dm_threads WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
    [dmThreadId, senderId]
  );
  if (threadCheck.rows.length === 0) throw new Error('NOT_IN_THREAD');

  const { body, imageUrl, attachments } = normalizeInput(input);

  const result = await pool.query(
    `INSERT INTO messages (dm_thread_id, sender_id, body, type, image_url, attachments)
     VALUES ($1, $2, $3, 'message', $4, $5::jsonb)
     RETURNING ${columnsWithoutPrefix()}`,
    [dmThreadId, senderId, body, imageUrl, JSON.stringify(attachments)]
  );
  return hydrateSender(result.rows[0], senderId);
}

export async function sendSystemMessage(
  channelId: string,
  actorId: string,
  body: string
): Promise<MessageWithSender> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO messages (channel_id, sender_id, body, type) VALUES ($1, $2, $3, 'system')
     RETURNING ${columnsWithoutPrefix()}`,
    [channelId, actorId, body]
  );
  return hydrateSender(result.rows[0], actorId);
}

function normalizeInput(input: SendMessageInput): {
  body: string;
  imageUrl: string | null;
  attachments: MessageAttachment[];
} {
  const body = (input.body ?? '').trim();
  const imageUrl = input.imageUrl && input.imageUrl.length > 0 ? input.imageUrl : null;
  const attachments = sanitizeAttachments(input.attachments);
  if (body.length === 0 && imageUrl === null && attachments.length === 0) {
    throw new Error('EMPTY_MESSAGE');
  }
  return { body, imageUrl, attachments };
}

function sanitizeAttachments(raw: unknown): MessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: MessageAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const type = obj.type;
    if (type === 'twenty_record') {
      const objectName = typeof obj.objectName === 'string' ? obj.objectName : '';
      const id = typeof obj.id === 'string' ? obj.id : '';
      const label = typeof obj.label === 'string' ? obj.label : '';
      if (objectName && id && label) {
        out.push({
          type: 'twenty_record',
          objectName,
          id,
          label,
          subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : null,
          avatarUrl: typeof obj.avatarUrl === 'string' ? obj.avatarUrl : null,
          url: typeof obj.url === 'string' ? obj.url : null,
        });
      }
    } else if (type === 'link') {
      const url = typeof obj.url === 'string' ? obj.url : '';
      if (url) {
        out.push({
          type: 'link',
          url,
          label: typeof obj.label === 'string' ? obj.label : null,
          description: typeof obj.description === 'string' ? obj.description : null,
          imageUrl: typeof obj.imageUrl === 'string' ? obj.imageUrl : null,
        });
      }
    } else if (type === 'file') {
      const url = typeof obj.url === 'string' ? obj.url : '';
      const name = typeof obj.name === 'string' ? obj.name : '';
      if (url && name) {
        out.push({
          type: 'file',
          url,
          name,
          mimeType: typeof obj.mimeType === 'string' ? obj.mimeType : null,
          sizeBytes: typeof obj.sizeBytes === 'number' ? obj.sizeBytes : null,
        });
      }
    }
  }
  return out;
}

function columnsWithoutPrefix(): string {
  return `id, sender_id, body, type, image_url, attachments, created_at, channel_id, dm_thread_id`;
}

async function hydrateSender(row: Record<string, unknown>, senderId: string): Promise<MessageWithSender> {
  const pool = getPool();
  const userRow = await pool.query('SELECT name, email FROM users WHERE id = $1', [senderId]);
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
    body: (row.body as string) ?? '',
    type: (row.type as string) ?? 'message',
    image_url: (row.image_url as string) ?? null,
    attachments: parseAttachments(row.attachments),
    created_at: row.created_at as Date,
    channel_id: (row.channel_id as string) ?? null,
    dm_thread_id: (row.dm_thread_id as string) ?? null,
    sender_name: (row.sender_name as string) ?? '',
    sender_email: (row.sender_email as string) ?? '',
  };
}

function parseAttachments(raw: unknown): MessageAttachment[] {
  if (raw === null || raw === undefined) return [];
  // pg returns JSONB as a parsed object already
  if (Array.isArray(raw)) return sanitizeAttachments(raw);
  if (typeof raw === 'string') {
    try {
      return sanitizeAttachments(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}
