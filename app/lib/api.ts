import { API_BASE_URL } from '@/constants/Config';

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...rest } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type LoginResponse = { user: User; token: string };
export type RegisterResponse = { user: User; message: string };
export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  status?: string;
  assigned_region_id: string | null;
  created_at: string;
};

export type Channel = {
  id: string;
  name: string;
  type: string;
  created_at: string;
  created_by: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
};

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  type?: string;
  image_url?: string | null;
  created_at: string;
  sender_name: string;
  sender_email: string;
};

export type DMThread = {
  id: string;
  other_user_id: string;
  other_user_name: string;
  other_user_email: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
};
