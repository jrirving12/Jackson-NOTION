import { StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Text, View } from '@/components/Themed';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tequila CRM</Text>
      <Text style={styles.subtitle}>Phase 0 – Foundation</Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={styles.hint}>Backend: auth + health. Phase 1: messaging.</Text>
      <Link href="/login" style={styles.link}>
        Login (placeholder)
      </Link>
    </View>
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
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.8,
    marginTop: 8,
  },
  separator: {
    marginVertical: 24,
    height: 1,
    width: '80%',
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
