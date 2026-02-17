import { useEffect, useState } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/context/AuthContext';
import { api, Channel, DMThread } from '@/lib/api';

type ConversationItem =
  | { type: 'channel'; id: string; name: string; preview: string | null; time: string | null }
  | { type: 'dm'; id: string; name: string; preview: string | null; time: string | null };

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MessagesScreen() {
  const { token, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!token) return;
    try {
      const [chRes, dmRes] = await Promise.all([
        api<{ channels: Channel[] }>('/api/channels', { token }),
        api<{ threads: DMThread[] }>('/api/dm/threads', { token }),
      ]);
      const items: ConversationItem[] = [
        ...chRes.channels.map((c) => ({
          type: 'channel' as const,
          id: c.id,
          name: c.name,
          preview: c.last_message_preview,
          time: c.last_message_at,
        })),
        ...dmRes.threads.map((t) => ({
          type: 'dm' as const,
          id: t.id,
          name: t.other_user_name,
          preview: t.last_message_preview,
          time: t.last_message_at,
        })),
      ].sort((a, b) => {
        const ta = a.time ? new Date(a.time).getTime() : 0;
        const tb = b.time ? new Date(b.time).getTime() : 0;
        return tb - ta;
      });
      setConversations(items);
    } catch {
      setConversations([]);
    }
  };

  useEffect(() => {
    if (token) load();
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!token || !user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.prompt}>Sign in to see messages</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/login')}>
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.newButton} onPress={() => router.push('/new-message')}>
        <Text style={styles.newButtonText}>New message</Text>
      </Pressable>
      <FlatList
        data={conversations}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptyHint}>Channels and DMs will appear here</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: '/thread',
                params: item.type === 'channel' ? { channelId: item.id } : { dmThreadId: item.id },
              })
            }
            activeOpacity={0.7}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.rowContent}>
              <View style={styles.rowTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.time ? (
                  <Text style={styles.time}>{formatTime(item.time)}</Text>
                ) : null}
              </View>
              {item.preview ? (
                <Text style={styles.preview} numberOfLines={1}>
                  {item.preview}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  newButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  prompt: {
    fontSize: 17,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  empty: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 17,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 15,
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 15,
    opacity: 0.6,
    marginLeft: 8,
  },
  preview: {
    fontSize: 15,
    opacity: 0.7,
  },
});
