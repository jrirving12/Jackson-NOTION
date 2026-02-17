import { StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { Text, View } from '@/components/Themed';

/**
 * Auth placeholder for Phase 0.
 * Phase 1: wire to POST /api/auth/login and store JWT; protect tabs when not logged in.
 */
export default function LoginScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Login' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Tequila CRM</Text>
        <Text style={styles.subtitle}>Login (placeholder)</Text>
        <Text style={styles.hint}>Auth will be wired in Phase 1. Backend: POST /api/auth/login</Text>
        <Link href="/" style={styles.link}>
          Back to Home
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.8,
    marginBottom: 16,
  },
  hint: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    marginBottom: 24,
  },
  link: {
    fontSize: 16,
    color: '#0a7ea4',
  },
});
