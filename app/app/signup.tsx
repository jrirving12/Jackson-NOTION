import { useState } from 'react';
import { StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/context/AuthContext';

export default function SignupScreen() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email.trim() || !password || !name.trim()) {
      Alert.alert('Error', 'Enter name, email, and password');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim());
      Alert.alert(
        'Account created',
        'An admin must approve your account before you can sign in. You will be notified when you can log in.',
        [{ text: 'OK', onPress: () => router.replace('/login') }]
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Signup failed';
      if (msg.includes('already registered') || msg.includes('EMAIL_IN_USE')) {
        Alert.alert('Email in use', 'That email is already registered. Sign in or use another email.');
      } else {
        Alert.alert('Signup failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Create account' }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          <Text style={styles.title}>Tequila CRM</Text>
          <Text style={styles.subtitle}>Create account</Text>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password-new"
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.link} onPress={() => router.replace('/login')}>
            <Text style={styles.linkText}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  inner: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 17,
    opacity: 0.8,
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    fontSize: 17,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  link: {
    marginTop: 20,
    alignSelf: 'center',
  },
  linkText: {
    fontSize: 16,
    color: '#007AFF',
  },
});
