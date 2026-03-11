import React from 'react';
import { useTranslation } from '@/lib/i18n';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Colors from '@/constants/Colors';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.tabIconSelected,
        tabBarInactiveTintColor: Colors.tabIconDefault,
        tabBarStyle: { backgroundColor: Colors.surface },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.tournaments'),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'trophy', android: 'sports_esports', web: 'sports_esports' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="entries"
        options={{
          title: t('tabs.myEntries'),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.2', android: 'group', web: 'group' }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: 'person.circle', android: 'person', web: 'person' }} tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
