import { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  useColorScheme,
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { api, Channel, DMThread } from '@/lib/api';

type ConversationItem = {
  type: 'channel' | 'dm';
  id: string;
  name: string;
  preview: string | null;
  time: string | null;
  unread: boolean;
};

const AVATAR_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE',
  '#5856D6', '#FF2D55', '#00C7BE', '#FF6482', '#30B0C7',
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function Avatar({ name, size = 52 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(name) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const { token, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const readSetRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!token || !user) return;
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
          unread: !!(c.last_message_sender_id && c.last_message_sender_id !== user.id) && !readSetRef.current.has(`channel-${c.id}`),
        })),
        ...dmRes.threads.map((t) => ({
          type: 'dm' as const,
          id: t.id,
          name: t.other_user_name,
          preview: t.last_message_preview,
          time: t.last_message_at,
          unread: !!(t.last_message_sender_id && t.last_message_sender_id !== user.id) && !readSetRef.current.has(`dm-${t.id}`),
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
  }, [token, user]);

  useFocusEffect(
    useCallback(() => {
      if (token) load();
    }, [token, load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markRead = (item: ConversationItem) => {
    const key = `${item.type}-${item.id}`;
    readSetRef.current.add(key);
    setConversations((prev) =>
      prev.map((c) => (c.type === item.type && c.id === item.id ? { ...c, unread: false } : c))
    );
  };

  const filtered = search.trim()
    ? conversations.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const unreadCount = conversations.filter((c) => c.unread).length;

  if (authLoading) {
    return (
      <View style={[styles.fullCenter, dark && styles.bgDark, { paddingTop: insets.top }]}>
        <Text style={[styles.loadingText, dark && styles.textLight]}>Loading...</Text>
      </View>
    );
  }

  if (!token || !user) {
    return (
      <View style={[styles.fullCenter, dark && styles.bgDark, { paddingTop: insets.top }]}>
        <Text style={[styles.prompt, dark && styles.textLight]}>Sign in to see messages</Text>
        <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/login')}>
          <Text style={styles.signInBtnText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, dark && styles.bgDark, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, dark && styles.headerDark]}>
        <TouchableOpacity style={styles.headerSide}>
          <Text style={styles.headerLink}>Edit</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, dark && styles.textLight]}>Messages</Text>
        <TouchableOpacity style={[styles.headerSide, styles.headerSideRight]}>
          <Text style={[styles.filterIcon, dark && { color: '#007AFF' }]}>⫸</Text>
        </TouchableOpacity>
      </View>

      {/* Conversation list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={dark ? '#fff' : '#007AFF'} />
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : undefined}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={[styles.emptyText, dark && styles.textLight]}>No conversations yet</Text>
            <Text style={[styles.emptyHint, dark && styles.textMuted]}>
              Tap the compose button to start chatting
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, dark && styles.rowDark]}
            onPress={() => {
              markRead(item);
              const otherUnread = conversations.filter((c) => c.unread && !(c.type === item.type && c.id === item.id)).length;
              router.push({
                pathname: '/thread',
                params: item.type === 'channel'
                  ? { channelId: item.id, name: item.name, unreadCount: String(otherUnread) }
                  : { dmThreadId: item.id, name: item.name, unreadCount: String(otherUnread) },
              });
            }}
            activeOpacity={0.6}
          >
            <View style={styles.dotCol}>
              {item.unread && <View style={styles.unreadDot} />}
            </View>
            <Avatar name={item.name} />
            <View style={styles.rowContent}>
              <View style={styles.rowTop}>
                <Text
                  style={[styles.name, dark && styles.textLight, item.unread && styles.nameBold]}
                  numberOfLines={1}
                >
                  {item.type === 'channel' ? `# ${item.name}` : item.name}
                </Text>
                <View style={styles.rowRight}>
                  {item.time ? (
                    <Text style={[styles.time, dark && styles.textMuted]}>
                      {formatTime(item.time)}
                    </Text>
                  ) : null}
                  <Text style={[styles.chevron, dark && styles.textMuted]}>›</Text>
                </View>
              </View>
              {item.preview ? (
                <Text
                  style={[
                    styles.preview,
                    dark && styles.textMuted,
                    item.unread && styles.previewBold,
                    item.unread && dark && { color: '#fff' },
                  ]}
                  numberOfLines={2}
                >
                  {item.preview}
                </Text>
              ) : (
                <Text style={[styles.preview, styles.previewEmpty, dark && styles.textMuted]}>
                  No messages yet
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, dark && styles.separatorDark]} />
        )}
      />

      {/* Bottom bar */}
      <View style={[styles.bottomBar, dark && styles.bottomBarDark, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.searchWrap, dark && styles.searchWrapDark]}>
          <Text style={[styles.searchIcon, dark && { color: '#8E8E93' }]}>⌕</Text>
          <TextInput
            style={[styles.searchInput, dark && { color: '#fff' }]}
            placeholder="Search"
            placeholderTextColor={dark ? '#636366' : '#8E8E93'}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity
          style={styles.composeBtn}
          onPress={() => router.push('/new-message')}
          activeOpacity={0.7}
        >
          <View style={[styles.composeBtnInner, dark && styles.composeBtnInnerDark]}>
            <Text style={styles.composePen}>✎</Text>
          </View>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  bgDark: { backgroundColor: '#000' },
  fullCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  loadingText: { fontSize: 17, color: '#666' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  headerDark: { backgroundColor: '#000' },
  headerSide: { width: 60 },
  headerSideRight: { alignItems: 'flex-end' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  headerLink: { fontSize: 17, color: '#007AFF' },
  filterIcon: { fontSize: 22, color: '#007AFF' },

  prompt: { fontSize: 17, marginBottom: 16, color: '#333' },
  signInBtn: { backgroundColor: '#007AFF', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  signInBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },

  emptyContainer: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', marginBottom: 6, color: '#000' },
  emptyHint: { fontSize: 15, color: '#8E8E93', textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 16,
    paddingLeft: 4,
    backgroundColor: '#fff',
  },
  rowDark: { backgroundColor: '#000' },
  dotCol: { width: 20, alignItems: 'center', justifyContent: 'center' },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  rowContent: { flex: 1, marginLeft: 12, minWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '400', color: '#000', flex: 1, marginRight: 8 },
  nameBold: { fontWeight: '700' },
  time: { fontSize: 14, color: '#8E8E93' },
  chevron: { fontSize: 20, color: '#C7C7CC', marginLeft: 4 },
  preview: { fontSize: 15, color: '#8E8E93', lineHeight: 20 },
  previewBold: { color: '#000', fontWeight: '500' },
  previewEmpty: { fontStyle: 'italic' },

  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.12)', marginLeft: 86 },
  separatorDark: { backgroundColor: 'rgba(255,255,255,0.12)' },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  bottomBarDark: { backgroundColor: '#000', borderTopColor: 'rgba(255,255,255,0.08)' },

  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 36,
  },
  searchWrapDark: { backgroundColor: 'rgba(118,118,128,0.24)' },
  searchIcon: { fontSize: 18, color: '#8E8E93', marginRight: 4 },
  searchInput: { flex: 1, fontSize: 16, color: '#000', paddingVertical: 0 },

  composeBtn: { marginLeft: 12 },
  composeBtnInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  composeBtnInnerDark: { backgroundColor: '#0A84FF' },
  composePen: { color: '#fff', fontSize: 18, fontWeight: '500' },

  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  textLight: { color: '#fff' },
  textMuted: { color: '#8E8E93' },
});
