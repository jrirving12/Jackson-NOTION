import {
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  View,
  Text,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function HomeScreen() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, dark && styles.bgDark]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={[styles.title, dark && styles.textLight]}>Tequila CRM</Text>
          <Text style={[styles.subtitle, dark && styles.textMuted]}>Sales & Communication</Text>
        </View>

        {token && user ? (
          <View style={styles.section}>
            {/* Account card */}
            <View style={[styles.card, dark && styles.cardDark]}>
              <View style={styles.accountRow}>
                <View style={[styles.accountAvatar, { backgroundColor: '#007AFF' }]}>
                  <Text style={styles.accountAvatarText}>
                    {user.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.accountInfo}>
                  <Text style={[styles.accountName, dark && styles.textLight]}>{user.name}</Text>
                  <Text style={[styles.accountEmail, dark && styles.textMuted]}>{user.email}</Text>
                  <Text style={[styles.accountRole, dark && styles.textMuted]}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={[styles.card, dark && styles.cardDark]}>
              <TouchableOpacity
                style={[styles.menuRow, styles.menuRowBorder, dark && styles.menuRowBorderDark]}
                onPress={() => router.push('/(tabs)/two')}
                activeOpacity={0.6}
              >
                <Text style={[styles.menuRowText, dark && styles.textLight]}>Messages</Text>
                <Text style={[styles.menuChevron, dark && styles.textMuted]}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={logout}
                activeOpacity={0.6}
              >
                <Text style={styles.menuRowTextDanger}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <TouchableOpacity style={styles.signInBtn} onPress={() => router.push('/login')}>
              <Text style={styles.signInBtnText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F2F7' },
  bgDark: { backgroundColor: '#000' },
  scroll: { paddingBottom: 40 },

  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#000' },
  subtitle: { fontSize: 16, color: '#8E8E93', marginTop: 4 },

  section: { paddingHorizontal: 16, gap: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardDark: { backgroundColor: '#1C1C1E' },

  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  accountAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountAvatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  accountInfo: { marginLeft: 14, flex: 1 },
  accountName: { fontSize: 20, fontWeight: '600', color: '#000' },
  accountEmail: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  accountRole: { fontSize: 13, color: '#8E8E93', marginTop: 2, textTransform: 'capitalize' },

  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.12)',
  },
  menuRowBorderDark: { borderBottomColor: 'rgba(255,255,255,0.12)' },
  menuRowText: { fontSize: 17, color: '#000' },
  menuChevron: { fontSize: 20, color: '#C7C7CC' },
  menuRowTextDanger: { fontSize: 17, color: '#FF3B30' },

  signInBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  signInBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },

  textLight: { color: '#fff' },
  textMuted: { color: '#8E8E93' },
});
