import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';
import { useTranslation } from '@/lib/i18n';

type TabId = 'feed' | 'tournaments' | 'profile';

export function PersistentBottomTabs({ active }: { active: TabId }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  const items: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap; href: string }[] = [
    { id: 'feed', label: t('tabs.feed'), icon: 'home', href: '/feed' },
    { id: 'tournaments', label: t('tabs.tournaments'), icon: 'trophy-outline', href: '/' },
    { id: 'profile', label: t('tabs.profile'), icon: 'person-circle-outline', href: '/profile' },
  ];

  return (
    <View
      style={[styles.wrap, { height: PERSISTENT_TABS_HEIGHT + insets.bottom, paddingBottom: Math.max(insets.bottom, 2) }]}
      accessibilityRole="tablist"
    >
      {items.map((it) => {
        const selected = it.id === active;
        const color = selected ? tokens.tabIconSelected : Colors.tabIconDefault;
        return (
          <Pressable
            key={it.id}
            style={styles.item}
            onPress={() => router.push(it.href as never)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Ionicons name={it.icon} size={22} color={color} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const PERSISTENT_TABS_HEIGHT = 56;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceLight,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});

