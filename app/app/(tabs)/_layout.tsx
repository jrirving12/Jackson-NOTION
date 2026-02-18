import React, { useEffect } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

// Fallback when FontAwesome is undefined (e.g. web production) to avoid React error #130.
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  if (!FontAwesome) {
    return (
      <View style={{ width: 28, height: 28, marginBottom: -3, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: props.color }}>•</Text>
      </View>
    );
  }
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { token, loading } = useAuth();
  const router = useRouter();
  const headerShown = useClientOnlyValue(false, true);

  useEffect(() => {
    if (!loading && !token) {
      router.replace('/login');
    }
  }, [loading, token]);

  if (!loading && !token) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="code" color={color} />,
          headerRight: () => (
            <Link href="/modal" asChild>
              <Pressable>
                {({ pressed }) =>
                  FontAwesome ? (
                    <FontAwesome
                      name="info-circle"
                      size={25}
                      color={Colors[colorScheme ?? 'light'].text}
                      style={{ marginRight: 15, opacity: pressed ? 0.5 : 1 }}
                    />
                  ) : (
                    <View style={{ width: 25, height: 25, marginRight: 15, opacity: pressed ? 0.5 : 1, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, color: Colors[colorScheme ?? 'light'].text }}>ⓘ</Text>
                    </View>
                  )
                }
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <TabBarIcon name="comments" color={color} />,
        }}
      />
    </Tabs>
  );
}
