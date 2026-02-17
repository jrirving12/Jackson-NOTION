import { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/context/AuthContext';
import { api, Message } from '@/lib/api';
import { API_BASE_URL } from '@/constants/Config';
import { io, Socket } from 'socket.io-client';

export default function ThreadScreen() {
  const params = useLocalSearchParams<{ channelId?: string; dmThreadId?: string }>();
  const channelId = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId;
  const dmThreadId = Array.isArray(params.dmThreadId) ? params.dmThreadId[0] : params.dmThreadId;
  const { token, user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList>(null);
  const isChannel = Boolean(channelId);

  const title = isChannel ? 'Channel' : 'Message';

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
      router.back();
      return;
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

  const send = async () => {
    const body = input.trim();
    if (!body || !token || sending) return;
    setSending(true);
    setInput('');
    try {
      const path = isChannel
        ? `/api/messages/channel/${channelId}`
        : `/api/messages/dm/${dmThreadId}`;
      await api(path, {
        method: 'POST',
        token,
        body: JSON.stringify({ body }),
      });
      loadMessages();
    } catch {
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  const isSent = (m: Message) => m.sender_id === user.id;

  return (
    <>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.bubbleWrap, isSent(item) ? styles.bubbleWrapRight : styles.bubbleWrapLeft]}>
              <View style={[styles.bubble, isSent(item) ? styles.bubbleSent : styles.bubbleReceived]}>
                <Text style={[styles.bubbleText, isSent(item) && styles.bubbleTextSent]}>
                  {item.body}
                </Text>
                <Text style={[styles.bubbleTime, isSent(item) && styles.bubbleTimeSent]}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          )}
        />
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor="#999"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            editable={!sending}
            onSubmitEditing={send}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 12, paddingBottom: 8 },
  bubbleWrap: { marginVertical: 4 },
  bubbleWrapLeft: { alignItems: 'flex-start' },
  bubbleWrapRight: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  bubbleSent: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
  },
  bubbleReceived: {
    backgroundColor: '#E5E5EA',
    borderBottomRightRadius: 18,
  },
  bubbleText: {
    fontSize: 17,
    color: '#000',
  },
  bubbleTextSent: {
    color: '#fff',
  },
  bubbleTime: {
    fontSize: 11,
    opacity: 0.7,
    marginTop: 4,
    color: '#000',
  },
  bubbleTimeSent: {
    color: 'rgba(255,255,255,0.8)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#f2f2f7',
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 100,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 17,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  sendBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
