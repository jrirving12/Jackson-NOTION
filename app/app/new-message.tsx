import { useEffect, useState } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  View,
  Text,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { showAlert } from '@/utils/alert';

type UserItem = { id: string; name: string; email: string };

const AVATAR_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE',
  '#5856D6', '#FF2D55', '#00C7BE', '#FF6482', '#30B0C7',
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hashColor(name), justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

export default function NewMessageScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const [users, setUsers] = useState<UserItem[]>([]);
  const [channelName, setChannelName] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'pick' | 'dm' | 'channel'>('pick');
  const [selectedMembers, setSelectedMembers] = useState<UserItem[]>([]);

  useEffect(() => {
    if (!token) return;
    api<{ users: UserItem[] }>('/api/users', { token })
      .then((data) => setUsers(data.users.filter((u) => u.id !== user?.id)))
      .catch(() => setUsers([]));
  }, [token]);

  const filteredUsers = users.filter(
    (u) =>
      (u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())) &&
      !selectedMembers.some((m) => m.id === u.id),
  );

  const toggleMember = (u: UserItem) => {
    setSelectedMembers((prev) =>
      prev.some((m) => m.id === u.id) ? prev.filter((m) => m.id !== u.id) : [...prev, u],
    );
    setSearch('');
  };

  const startDM = async (otherUserId: string) => {
    if (!token) return;
    setCreating(true);
    try {
      const thread = await api<{ id: string }>('/api/dm/threads', {
        method: 'POST',
        token,
        body: JSON.stringify({ other_user_id: otherUserId }),
      });
      router.replace({ pathname: '/thread', params: { dmThreadId: thread.id } });
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not start conversation');
    } finally {
      setCreating(false);
    }
  };

  const createChannel = async () => {
    const name = channelName.trim();
    if (!name || !token) return;
    setCreating(true);
    try {
      const channel = await api<{ id: string }>('/api/channels', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name,
          type: 'general',
          memberIds: selectedMembers.map((m) => m.id),
        }),
      });
      router.replace({ pathname: '/thread', params: { channelId: channel.id, name } });
    } catch (e) {
      showAlert('Error', e instanceof Error ? e.message : 'Could not create channel');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New Message',
          headerBackTitle: '',
          headerStyle: { backgroundColor: dark ? '#000' : '#fff' },
          headerTintColor: '#007AFF',
          headerTitleStyle: { color: dark ? '#fff' : '#000', fontWeight: '600' },
        }}
      />
      <View style={[styles.container, dark && styles.containerDark]}>
        {mode === 'pick' && (
          <View style={styles.pickContainer}>
            <TouchableOpacity
              style={[styles.option, dark && styles.optionDark]}
              onPress={() => setMode('dm')}
              activeOpacity={0.6}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#007AFF' }]}>
                <Text style={styles.optionIconText}>💬</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, dark && styles.textLight]}>Message a Person</Text>
                <Text style={[styles.optionSub, dark && styles.textMuted]}>Start a 1:1 conversation</Text>
              </View>
              <Text style={[styles.chevron, dark && styles.textMuted]}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.option, dark && styles.optionDark]}
              onPress={() => setMode('channel')}
              activeOpacity={0.6}
            >
              <View style={[styles.optionIcon, { backgroundColor: '#34C759' }]}>
                <Text style={styles.optionIconText}>👥</Text>
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, dark && styles.textLight]}>Create a Channel</Text>
                <Text style={[styles.optionSub, dark && styles.textMuted]}>New group conversation</Text>
              </View>
              <Text style={[styles.chevron, dark && styles.textMuted]}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'dm' && (
          <View style={styles.listContainer}>
            <View style={[styles.toBar, dark && styles.toBarDark]}>
              <Text style={styles.toLabel}>To:</Text>
              <TextInput
                style={[styles.toInput, dark && { color: '#fff' }]}
                placeholder="Search people..."
                placeholderTextColor={dark ? '#636366' : '#8E8E93'}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
            {creating ? (
              <View style={styles.loadingWrap}><ActivityIndicator color="#007AFF" /></View>
            ) : (
              <FlatList
                data={filteredUsers}
                keyExtractor={(u) => u.id}
                keyboardDismissMode="on-drag"
                ListEmptyComponent={
                  <View style={styles.noResults}>
                    <Text style={[styles.noResultsText, dark && styles.textMuted]}>
                      {search ? 'No matches found' : 'No users available'}
                    </Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.userRow, dark && styles.userRowDark]}
                    onPress={() => startDM(item.id)}
                    activeOpacity={0.6}
                  >
                    <Avatar name={item.name} />
                    <View style={styles.userInfo}>
                      <Text style={[styles.userName, dark && styles.textLight]}>{item.name}</Text>
                      <Text style={[styles.userEmail, dark && styles.textMuted]}>{item.email}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => (
                  <View style={[styles.separator, dark && styles.separatorDark]} />
                )}
              />
            )}
          </View>
        )}

        {mode === 'channel' && (
          <ScrollView style={styles.channelScroll} keyboardDismissMode="on-drag">
            {/* Channel name */}
            <View style={[styles.card, dark && styles.cardDark]}>
              <Text style={[styles.cardLabel, dark && styles.textMuted]}>Channel Name</Text>
              <TextInput
                style={[styles.cardInput, dark && styles.cardInputDark]}
                placeholder="e.g. sales-team"
                placeholderTextColor={dark ? '#636366' : '#8E8E93'}
                value={channelName}
                onChangeText={setChannelName}
                editable={!creating}
                autoFocus
              />
            </View>

            {/* Selected members */}
            {selectedMembers.length > 0 && (
              <View style={[styles.card, dark && styles.cardDark]}>
                <Text style={[styles.cardLabel, dark && styles.textMuted]}>
                  Members ({selectedMembers.length})
                </Text>
                {selectedMembers.map((m) => (
                  <View key={m.id} style={styles.memberChipRow}>
                    <Avatar name={m.name} size={32} />
                    <Text style={[styles.memberChipName, dark && styles.textLight]}>{m.name}</Text>
                    <TouchableOpacity onPress={() => toggleMember(m)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add members */}
            <View style={[styles.card, dark && styles.cardDark]}>
              <Text style={[styles.cardLabel, dark && styles.textMuted]}>Add Members</Text>
              <TextInput
                style={[styles.cardInput, dark && styles.cardInputDark]}
                placeholder="Search people to add..."
                placeholderTextColor={dark ? '#636366' : '#8E8E93'}
                value={search}
                onChangeText={setSearch}
              />
              {filteredUsers.slice(0, 10).map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.addMemberRow}
                  onPress={() => toggleMember(u)}
                  activeOpacity={0.6}
                >
                  <Avatar name={u.name} size={36} />
                  <View style={styles.addMemberInfo}>
                    <Text style={[styles.addMemberName, dark && styles.textLight]}>{u.name}</Text>
                    <Text style={[styles.addMemberEmail, dark && styles.textMuted]}>{u.email}</Text>
                  </View>
                  <View style={[styles.addBtn, dark && styles.addBtnDark]}>
                    <Text style={styles.addBtnText}>+</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Create button */}
            <TouchableOpacity
              style={[styles.createBtn, (!channelName.trim() || creating) && styles.createBtnDisabled]}
              onPress={createChannel}
              disabled={!channelName.trim() || creating}
              activeOpacity={0.7}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>
                  Create Channel{selectedMembers.length > 0 ? ` with ${selectedMembers.length} member${selectedMembers.length > 1 ? 's' : ''}` : ''}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  containerDark: { backgroundColor: '#000' },

  pickContainer: { padding: 16, gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  optionDark: { backgroundColor: '#1C1C1E' },
  optionIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  optionIconText: { fontSize: 22 },
  optionContent: { flex: 1, marginLeft: 14 },
  optionTitle: { fontSize: 17, fontWeight: '600', color: '#000', marginBottom: 2 },
  optionSub: { fontSize: 14, color: '#8E8E93' },
  chevron: { fontSize: 24, color: '#C7C7CC', marginLeft: 4 },

  listContainer: { flex: 1 },
  toBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.12)',
  },
  toBarDark: { backgroundColor: '#1C1C1E', borderBottomColor: 'rgba(255,255,255,0.12)' },
  toLabel: { fontSize: 16, fontWeight: '500', color: '#8E8E93', marginRight: 8 },
  toInput: { flex: 1, fontSize: 17, color: '#000', paddingVertical: 4 },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  userRowDark: {},
  userInfo: { flex: 1, marginLeft: 12 },
  userName: { fontSize: 17, fontWeight: '500', color: '#000' },
  userEmail: { fontSize: 14, color: '#8E8E93', marginTop: 1 },

  noResults: { padding: 32, alignItems: 'center' },
  noResultsText: { fontSize: 15, color: '#8E8E93' },

  channelScroll: { flex: 1, padding: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardDark: { backgroundColor: '#1C1C1E' },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  cardInput: {
    fontSize: 17,
    color: '#000',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
    paddingVertical: 8,
    marginBottom: 4,
  },
  cardInputDark: { color: '#fff', borderColor: 'rgba(255,255,255,0.12)' },

  memberChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  memberChipName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#000', marginLeft: 10 },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: '#FF3B30', fontSize: 12, fontWeight: '700' },

  addMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  addMemberInfo: { flex: 1, marginLeft: 10 },
  addMemberName: { fontSize: 16, fontWeight: '500', color: '#000' },
  addMemberEmail: { fontSize: 13, color: '#8E8E93' },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,122,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDark: { backgroundColor: 'rgba(10,132,255,0.2)' },
  addBtnText: { color: '#007AFF', fontSize: 18, fontWeight: '500' },

  createBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 40,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },

  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.12)', marginLeft: 72 },
  separatorDark: { backgroundColor: 'rgba(255,255,255,0.12)' },

  textLight: { color: '#fff' },
  textMuted: { color: '#8E8E93' },
});
