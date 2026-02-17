import { useEffect, useState } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

type UserItem = { id: string; name: string; email: string };

export default function NewMessageScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'pick' | 'dm' | 'channel'>('pick');

  useEffect(() => {
    if (!token) return;
    api<{ users: UserItem[] }>('/api/users', { token })
      .then((data) => setUsers(data.users))
      .catch(() => setUsers([]));
  }, [token]);

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
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start conversation');
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
        body: JSON.stringify({ name, type: 'general' }),
      });
      router.replace({ pathname: '/thread', params: { channelId: channel.id } });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create channel');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'New message' }} />
      <View style={styles.container}>
        {mode === 'pick' && (
          <>
            <TouchableOpacity style={styles.option} onPress={() => setMode('dm')}>
              <Text style={styles.optionTitle}>Message a person</Text>
              <Text style={styles.optionSub}>Start a 1:1 conversation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={() => setMode('channel')}>
              <Text style={styles.optionTitle}>Create a channel</Text>
              <Text style={styles.optionSub}>New group chat</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === 'dm' && (
          <>
            <TouchableOpacity style={styles.back} onPress={() => setMode('pick')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <FlatList
              data={users}
              keyExtractor={(u) => u.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => startDM(item.id)}
                  disabled={creating}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userEmail}>{item.email}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </>
        )}

        {mode === 'channel' && (
          <>
            <TouchableOpacity style={styles.back} onPress={() => setMode('pick')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Channel name"
              placeholderTextColor="#999"
              value={channelName}
              onChangeText={setChannelName}
              editable={!creating}
            />
            <TouchableOpacity
              style={[styles.createBtn, (!channelName.trim() || creating) && styles.createBtnDisabled]}
              onPress={createChannel}
              disabled={!channelName.trim() || creating}
            >
              <Text style={styles.createBtnText}>Create channel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  option: {
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  optionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  optionSub: { fontSize: 15, opacity: 0.7 },
  back: { paddingVertical: 12, marginBottom: 8 },
  backText: { fontSize: 17, color: '#007AFF' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontWeight: '500' },
  userEmail: { fontSize: 15, opacity: 0.6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    fontSize: 17,
    marginBottom: 16,
  },
  createBtn: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
