import React, { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { authApi } from '@/lib/api';
import { useUserStore } from '@/store/useUserStore';
import type { User } from '@/types';

export default function TabLayout() {
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    const { accessToken, user } = useUserStore.getState();
    if (!accessToken || !user) return;
    void (async () => {
      try {
        const u = (await authApi.me()) as User;
        if (!cancelled) useUserStore.getState().setUser(u);
      } catch {
        /* keep cached user on network errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Tabs
      initialRouteName="feed"
      screenOptions={{
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.tabIconSelected,
        tabBarInactiveTintColor: Colors.tabIconDefault,
        tabBarStyle: { backgroundColor: Colors.surface },
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: t('tabs.feed'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.tournaments'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
