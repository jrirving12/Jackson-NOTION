import { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  View,
  Text,
  Image,
  ActionSheetIOS,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/context/AuthContext';
import { api, Message, User } from '@/lib/api';
import { API_BASE_URL } from '@/constants/Config';
import { io, Socket } from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '@/utils/alert';

type ChannelMember = {
  user_id: string;
  name: string;
  email: string;
  role: string;
};

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDateHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

const AVATAR_COLORS = [
  '#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE',
  '#5856D6', '#FF2D55', '#00C7BE', '#FF6482', '#30B0C7',
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function ThreadScreen() {
  const params = useLocalSearchParams<{ channelId?: string; dmThreadId?: string; name?: string; unreadCount?: string }>();
  const channelId = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId;
  const dmThreadId = Array.isArray(params.dmThreadId) ? params.dmThreadId[0] : params.dmThreadId;
  const threadName = Array.isArray(params.name) ? params.name[0] : params.name;
  const unreadCount = parseInt(Array.isArray(params.unreadCount) ? params.unreadCount[0] : params.unreadCount || '0', 10) || 0;
  const { token, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [pickedImage, setPickedImage] = useState<string | null>(null);
  const [membersVisible, setMembersVisible] = useState(false);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const isChannel = Boolean(channelId);

  const title = threadName || (isChannel ? 'Channel' : 'Message');

  const loadMessages = useCallback(async () => {
    if (!token) return;
    const path = isChannel
      ? `/api/messages/channel/${channelId}`
      : `/api/messages/dm/${dmThreadId}`;
    try {
      const data = await api<{ messages: Message[] }>(path, { token });
      setMessages(data.messages);
    } catch {
      setMessages([]);
    }
  }, [token, channelId, dmThreadId, isChannel]);

  useEffect(() => {
    if (!token || (!channelId && !dmThreadId)) {
      const t = setTimeout(() => router.back(), 0);
      return () => clearTimeout(t);
    }
    loadMessages();
  }, [token, channelId, dmThreadId, loadMessages]);

  useEffect(() => {
    if (!token) return;
    const socket = io(API_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    if (isChannel && channelId) socket.emit('join_channel', channelId);
    if (!isChannel && dmThreadId) socket.emit('join_dm', dmThreadId);
    socket.on('new_message', (msg: Message) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    return () => {
      if (isChannel && channelId) socket.emit('leave_channel', channelId);
      if (!isChannel && dmThreadId) socket.emit('leave_dm', dmThreadId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, isChannel, channelId, dmThreadId]);

  const prevCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  const sendingRef = useRef(false);

  const send = async () => {
    const body = input.trim();
    if ((!body && !pickedImage) || !token || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const savedInput = input;
    setInput('');
    setPickedImage(null);
    try {
      const path = isChannel
        ? `/api/messages/channel/${channelId}`
        : `/api/messages/dm/${dmThreadId}`;
      const messageBody = pickedImage ? (body || '[Photo]') : body;
      await api(path, {
        method: 'POST',
        token,
        body: JSON.stringify({ body: messageBody }),
      });
      await loadMessages();
    } catch {
      setInput(savedInput);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const pickImage = async () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) launchCamera();
          else if (buttonIndex === 2) launchLibrary();
        },
      );
    } else {
      launchLibrary();
    }
  };

  const launchCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission needed', 'Camera access is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (!result.canceled && result.assets[0]) setPickedImage(result.assets[0].uri);
  };

  const launchLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) setPickedImage(result.assets[0].uri);
  };

  const loadMembers = async () => {
    if (!isChannel || !channelId || !token) return;
    try {
      const data = await api<{ members: ChannelMember[] }>(`/api/channels/${channelId}/members`, { token });
      setMembers(data.members);
    } catch {
      showAlert('Error', 'Could not load members.');
    }
  };

  const openMembers = async () => {
    await loadMembers();
    setMembersVisible(true);
  };

  const openAddMember = async () => {
    if (!token) return;
    try {
      const data = await api<{ users: User[] }>('/api/users', { token });
      setAllUsers(data.users.filter((u) => u.id !== user?.id));
    } catch {
      setAllUsers([]);
    }
    setMemberSearch('');
    setAddingMember(true);
  };

  const addMember = async (userId: string) => {
    if (!token || !channelId) return;
    try {
      await api(`/api/channels/${channelId}/members`, {
        method: 'POST',
        token,
        body: JSON.stringify({ memberId: userId }),
      });
      await loadMembers();
      setAddingMember(false);
    } catch {
      showAlert('Error', 'Could not add member.');
    }
  };

  const openSettings = () => {
    setEditName(threadName || '');
    setSettingsVisible(true);
  };

  const saveChannelName = async () => {
    if (!token || !channelId || !editName.trim()) return;
    setSaving(true);
    try {
      await api(`/api/channels/${channelId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ name: editName.trim() }),
      });
      showAlert('Renamed', `Channel renamed to "${editName.trim()}".`);
      setSettingsVisible(false);
    } catch {
      showAlert('Error', 'Could not rename channel.');
    } finally {
      setSaving(false);
    }
  };

  const removeMember = (memberId: string, memberName: string) => {
    if (!token || !channelId) return;
    showAlert(
      'Remove Member',
      `Remove ${memberName} from this channel?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api(`/api/channels/${channelId}/members/${memberId}`, {
                method: 'DELETE',
                token,
              });
              await loadMembers();
            } catch (e) {
              showAlert('Error', e instanceof Error ? e.message : 'Could not remove member.');
            }
          },
        },
      ]
    );
  };

  if (!user) return null;

  const isSent = (m: Message) => m.sender_id === user.id;
  const hasContent = input.trim() || pickedImage;

  return (
    <>
      <Stack.Screen
        options={{
          headerBackVisible: false,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: dark ? '#000' : '#fff' },
          headerTintColor: dark ? '#fff' : '#000',
          headerShadowVisible: false,
          headerTitle: () =>
            isChannel ? (
              <TouchableOpacity onPress={openMembers} activeOpacity={0.6}>
                <Text style={[styles.headerTitleText, dark && { color: '#fff' }]}>{title}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.headerTitleText, dark && { color: '#fff' }]}>{title}</Text>
            ),
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.backBtn}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={28} color="#007AFF" />
              {unreadCount > 0 && (
                <View style={styles.backBadge}>
                  <Text style={styles.backBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          ),
        }}
      />

      {/* Channel members modal */}
      <Modal
        visible={membersVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setMembersVisible(false); setAddingMember(false); setSettingsVisible(false); }}
      >
        <View style={[styles.modalContainer, dark && { backgroundColor: '#1C1C1E' }]}>
          {settingsVisible ? (
            /* ──── Settings view ──── */
            <>
              <View style={[styles.modalHeader, dark && { borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity style={styles.modalHeaderSide} onPress={() => setSettingsVisible(false)} activeOpacity={0.6}>
                    <Text style={styles.modalBackText}>Back</Text>
                  </TouchableOpacity>
                  <View style={styles.modalHeaderCenter}>
                    <Text style={[styles.modalTitle, dark && { color: '#fff' }]}>Settings</Text>
                  </View>
                  <View style={styles.modalHeaderSide} />
                </View>
              </View>

              <View style={{ paddingHorizontal: 20, paddingTop: 20, flex: 1 }}>
                <Text style={[styles.settingsLabel, dark && { color: '#8E8E93' }]}>Channel Name</Text>
                <TextInput
                  style={[styles.settingsInput, dark && styles.settingsInputDark]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Channel name"
                  placeholderTextColor={dark ? '#636366' : '#8E8E93'}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.settingsSaveBtn, (!editName.trim() || saving) && { opacity: 0.5 }]}
                  onPress={saveChannelName}
                  disabled={!editName.trim() || saving}
                  activeOpacity={0.7}
                >
                  <Text style={styles.settingsSaveBtnText}>{saving ? 'Saving...' : 'Save Name'}</Text>
                </TouchableOpacity>

                <Text style={[styles.settingsLabel, dark && { color: '#8E8E93' }, { marginTop: 32 }]}>
                  Remove Members
                </Text>
                <FlatList
                  data={members.filter((m) => m.user_id !== user?.id)}
                  keyExtractor={(m) => m.user_id}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                  ListEmptyComponent={
                    <Text style={{ color: '#8E8E93', fontSize: 15, paddingVertical: 12 }}>
                      No other members to remove
                    </Text>
                  }
                  renderItem={({ item: m }) => {
                    const initials = m.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <View style={[styles.memberRow, dark && { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
                        <View style={[styles.memberAvatar, { backgroundColor: hashColor(m.name) }]}>
                          <Text style={styles.memberAvatarText}>{initials}</Text>
                        </View>
                        <View style={styles.memberInfo}>
                          <Text style={[styles.memberName, dark && { color: '#fff' }]}>{m.name}</Text>
                          <Text style={[styles.memberEmail, dark && { color: '#8E8E93' }]}>{m.email}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeMember(m.user_id, m.name)} activeOpacity={0.6}>
                          <Ionicons name="remove-circle" size={24} color="#FF3B30" />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              </View>
            </>
          ) : addingMember ? (
            /* ──── Add member view ──── */
            <>
              <View style={[styles.modalHeader, dark && { borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity style={styles.modalHeaderSide} onPress={() => setAddingMember(false)} activeOpacity={0.6}>
                    <Text style={styles.modalBackText}>Back</Text>
                  </TouchableOpacity>
                  <View style={styles.modalHeaderCenter}>
                    <Text style={[styles.modalTitle, dark && { color: '#fff' }]}>Add Member</Text>
                  </View>
                  <View style={styles.modalHeaderSide} />
                </View>
                <View style={[styles.modalSearchWrap, dark && { backgroundColor: 'rgba(118,118,128,0.24)' }]}>
                  <Ionicons name="search" size={16} color="#8E8E93" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.modalSearchInput, dark && { color: '#fff' }]}
                    placeholder="Search users..."
                    placeholderTextColor={dark ? '#636366' : '#8E8E93'}
                    value={memberSearch}
                    onChangeText={setMemberSearch}
                    autoFocus
                  />
                </View>
              </View>
              <FlatList
                data={allUsers.filter(
                  (u) =>
                    !members.some((m) => m.user_id === u.id) &&
                    (u.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
                      u.email.toLowerCase().includes(memberSearch.toLowerCase()))
                )}
                keyExtractor={(u) => u.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
                ListEmptyComponent={
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, color: '#8E8E93' }}>
                      {memberSearch.trim() ? 'No matching users' : 'All users are already members'}
                    </Text>
                  </View>
                }
                renderItem={({ item: u }) => {
                  const initials = u.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <TouchableOpacity
                      style={[styles.memberRow, dark && { borderBottomColor: 'rgba(255,255,255,0.08)' }]}
                      onPress={() => addMember(u.id)}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.memberAvatar, { backgroundColor: hashColor(u.name) }]}>
                        <Text style={styles.memberAvatarText}>{initials}</Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, dark && { color: '#fff' }]}>{u.name}</Text>
                        <Text style={[styles.memberEmail, dark && { color: '#8E8E93' }]}>{u.email}</Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          ) : (
            /* ──── Members list view ──── */
            <>
              <View style={[styles.modalHeader, dark && { borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity style={styles.modalHeaderSide} onPress={openSettings} activeOpacity={0.6}>
                    <Ionicons name="settings-outline" size={24} color="#007AFF" />
                  </TouchableOpacity>
                  <View style={styles.modalHeaderCenter}>
                    <Text style={[styles.modalTitle, dark && { color: '#fff' }]}>{title}</Text>
                    <Text style={[styles.modalSubtitle, dark && { color: '#8E8E93' }]}>
                      {members.length} {members.length === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.modalHeaderSide} onPress={openAddMember} activeOpacity={0.6}>
                    <Ionicons name="add-circle" size={28} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              </View>
              <FlatList
                data={members}
                keyExtractor={(m) => m.user_id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
                renderItem={({ item: m }) => {
                  const initials = m.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <View style={[styles.memberRow, dark && { borderBottomColor: 'rgba(255,255,255,0.08)' }]}>
                      <View style={[styles.memberAvatar, { backgroundColor: hashColor(m.name) }]}>
                        <Text style={styles.memberAvatarText}>{initials}</Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={[styles.memberName, dark && { color: '#fff' }]}>{m.name}</Text>
                        <Text style={[styles.memberEmail, dark && { color: '#8E8E93' }]}>{m.email}</Text>
                      </View>
                      {m.role === 'admin' && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>Admin</Text>
                        </View>
                      )}
                    </View>
                  );
                }}
              />
              <TouchableOpacity
                style={[styles.modalDone, { marginBottom: insets.bottom + 8 }]}
                onPress={() => setMembersVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={[styles.container, dark && styles.containerDark]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="always"
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={[styles.emptyThreadText, dark && { color: '#8E8E93' }]}>
                Send a message to start the conversation
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            if (item.type === 'system') {
              return (
                <View style={styles.systemMsgRow}>
                  <Text style={[styles.systemMsgText, dark && { color: '#636366' }]}>
                    {item.body}
                  </Text>
                </View>
              );
            }

            const sent = isSent(item);
            const prev = index > 0 ? messages[index - 1] : null;
            const next = index < messages.length - 1 ? messages[index + 1] : null;
            const showDate = !prev || !isSameDay(prev.created_at, item.created_at);
            const prevIsSystem = prev?.type === 'system';
            const nextIsSystem = next?.type === 'system';
            const showSender = isChannel && !sent && (!prev || prev.sender_id !== item.sender_id || prevIsSystem);
            const isFirstInGroup = !prev || prev.sender_id !== item.sender_id || showDate || prevIsSystem;
            const isLastInGroup = !next || next.sender_id !== item.sender_id || nextIsSystem || (next && !isSameDay(item.created_at, next.created_at));

            return (
              <View>
                {showDate && (
                  <View style={styles.dateHeader}>
                    <Text style={[styles.dateHeaderText, dark && { color: '#8E8E93' }]}>
                      {formatDateHeader(item.created_at)}
                    </Text>
                  </View>
                )}
                {showSender && (
                  <Text style={[styles.senderName, dark && { color: '#8E8E93' }]}>
                    {item.sender_name}
                  </Text>
                )}
                <View
                  style={[
                    styles.bubbleRow,
                    sent ? styles.bubbleRowRight : styles.bubbleRowLeft,
                    !isFirstInGroup && styles.bubbleRowTight,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      sent ? styles.bubbleSent : (dark ? styles.bubbleReceivedDark : styles.bubbleReceived),
                      sent
                        ? { borderTopRightRadius: isFirstInGroup ? 18 : 4, borderBottomRightRadius: isLastInGroup ? 18 : 4 }
                        : { borderTopLeftRadius: isFirstInGroup ? 18 : 4, borderBottomLeftRadius: isLastInGroup ? 18 : 4 },
                    ]}
                  >
                    <Text style={[styles.bubbleText, sent && styles.bubbleTextSent, dark && !sent && { color: '#fff' }]}>
                      {item.body}
                    </Text>
                  </View>
                </View>
                {isLastInGroup && (
                  <Text
                    style={[
                      styles.bubbleTime,
                      sent ? styles.bubbleTimeRight : styles.bubbleTimeLeft,
                      dark && { color: '#636366' },
                    ]}
                  >
                    {formatMessageTime(item.created_at)}
                  </Text>
                )}
              </View>
            );
          }}
          ListFooterComponent={<View style={{ height: 8 }} />}
        />

        {/* Compose area */}
        <View style={[styles.composeArea, dark && styles.composeAreaDark, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <TouchableOpacity style={styles.plusBtn} onPress={pickImage} activeOpacity={0.6}>
            <View style={[styles.plusBtnCircle, dark && styles.plusBtnCircleDark]}>
              <Text style={[styles.plusBtnText, dark && { color: '#fff' }]}>+</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.composeBubble, dark && styles.composeBubbleDark]}>
            {pickedImage && (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: pickedImage }} style={styles.imagePreview} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.imageCloseBtn}
                  onPress={() => setPickedImage(null)}
                  activeOpacity={0.7}
                >
                  <View style={styles.imageCloseBtnInner}>
                    <Text style={styles.imageCloseText}>✕</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
            <TextInput
              ref={inputRef}
              style={[styles.composeInput, dark && styles.composeInputDark]}
              placeholder={pickedImage ? 'Add comment or Send' : 'Message'}
              placeholderTextColor={dark ? '#636366' : '#8E8E93'}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              blurOnSubmit={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.sendBtn, !hasContent && styles.sendBtnHidden]}
            onPress={send}
            disabled={!hasContent || sending}
            activeOpacity={0.7}
          >
            <View style={[styles.sendBtnCircle, sending && { opacity: 0.5 }]}>
              <Text style={styles.sendBtnArrow}>↑</Text>
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  containerDark: { backgroundColor: '#000' },

  headerTitleText: { fontSize: 17, fontWeight: '600', color: '#000' },

  listContent: { paddingHorizontal: 16, paddingTop: 8 },
  listEmpty: { flex: 1, justifyContent: 'center' },

  emptyThread: { alignItems: 'center', padding: 24 },
  emptyThreadText: { fontSize: 15, color: '#8E8E93', textAlign: 'center' },

  dateHeader: { alignItems: 'center', marginVertical: 16 },
  dateHeaderText: { fontSize: 12, fontWeight: '600', color: '#8E8E93' },

  senderName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
    marginLeft: 4,
    marginTop: 8,
    marginBottom: 2,
  },

  bubbleRow: { marginVertical: 1 },
  bubbleRowTight: { marginVertical: 0.5 },
  bubbleRowLeft: { alignItems: 'flex-start', marginRight: 60 },
  bubbleRowRight: { alignItems: 'flex-end', marginLeft: 60 },

  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
  },
  bubbleSent: { backgroundColor: '#007AFF' },
  bubbleReceived: { backgroundColor: '#E5E5EA' },
  bubbleReceivedDark: { backgroundColor: '#26252A' },

  bubbleText: { fontSize: 17, color: '#000', lineHeight: 22 },
  bubbleTextSent: { color: '#fff' },

  systemMsgRow: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 32,
  },
  systemMsgText: {
    fontSize: 13,
    color: '#8E8E93',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },

  bubbleTime: { fontSize: 11, color: '#8E8E93', marginTop: 2, marginBottom: 4 },
  bubbleTimeLeft: { marginLeft: 4 },
  bubbleTimeRight: { textAlign: 'right', marginRight: 4 },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    marginLeft: -2,
  },
  backBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  composeArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 6,
    backgroundColor: '#fff',
  },
  composeAreaDark: { backgroundColor: '#000' },

  plusBtn: { marginRight: 6, marginBottom: 4 },
  plusBtnCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBtnCircleDark: { backgroundColor: '#3A3A3C' },
  plusBtnText: { fontSize: 22, fontWeight: '300', color: '#000', marginTop: -1 },

  composeBubble: {
    flex: 1,
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  composeBubbleDark: { backgroundColor: 'rgba(118,118,128,0.24)' },

  imagePreviewWrap: {
    margin: 6,
    marginBottom: 0,
    borderRadius: 14,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
  },
  imageCloseBtn: { position: 'absolute', top: 6, right: 6 },
  imageCloseBtnInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageCloseText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  composeInput: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 17,
    color: '#000',
    maxHeight: 120,
    minHeight: 36,
  },
  composeInputDark: { color: '#fff' },

  sendBtn: { marginLeft: 6, marginBottom: 4 },
  sendBtnHidden: { opacity: 0 },
  sendBtnCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnArrow: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: -1 },

  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalHeaderSide: { width: 50, alignItems: 'center' },
  modalHeaderCenter: { flex: 1, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  modalSubtitle: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  modalBackText: { fontSize: 17, color: '#007AFF' },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    marginTop: 12,
  },
  modalSearchInput: { flex: 1, fontSize: 16, color: '#000', paddingVertical: 0 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { fontSize: 16, fontWeight: '600', color: '#000' },
  memberEmail: { fontSize: 13, color: '#8E8E93', marginTop: 1 },
  adminBadge: {
    backgroundColor: 'rgba(0,122,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adminBadgeText: { fontSize: 12, fontWeight: '600', color: '#007AFF' },
  modalDone: {
    marginHorizontal: 20,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalDoneText: { color: '#fff', fontSize: 17, fontWeight: '600' },

  settingsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  settingsInput: {
    fontSize: 17,
    color: '#000',
    backgroundColor: 'rgba(118,118,128,0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsInputDark: {
    color: '#fff',
    backgroundColor: 'rgba(118,118,128,0.24)',
  },
  settingsSaveBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  settingsSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
