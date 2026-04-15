import React, { useCallback, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { adminApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { User } from '@/types';
import { useTheme } from '@/lib/theme/useTheme';

function isUserDoc(x: unknown): x is User {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as User)._id === 'string' &&
    typeof (x as User).email === 'string'
  );
}

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config.api.isConfigured) {
      setError('API not configured');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const raw = await adminApi.users({ limit: '100' });
      setItems(raw.filter(isUserDoc));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <>
      <Stack.Screen options={{ title: t('admin.usersScreenTitle') }} />
      <View style={styles.container}>
        <Text style={styles.hint}>{t('admin.usersListHint')}</Text>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {loading && items.length === 0 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={tokens.accent} />
            <Text style={styles.muted}>{t('common.loading')}</Text>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(row) => row._id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} />
            }
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.muted}>{t('admin.noUsers')}</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => router.push(`/admin/users/${item._id}` as never)}
                onLongPress={() => router.push(`/profile/${item._id}` as never)}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.username || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                <View style={[styles.badge, item.role === 'admin' && styles.badgeAdmin, item.role === 'admin' && { backgroundColor: tokens.accentHover }]}>
                  <Text style={[styles.badgeText, item.role === 'admin' && styles.badgeTextOnAccent]}>
                    {item.role === 'admin' ? t('admin.badgeAdmin') : t('admin.badgeUser')}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { flex: 1 },
  hint: {
    fontSize: 13,
    color: Colors.textMuted,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    marginBottom: 10,
  },
  rowPressed: { opacity: 0.92 },
  rowMain: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  badgeAdmin: {
    backgroundColor: Colors.surfaceLight,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  badgeTextOnAccent: {
    color: '#fff',
  },
  loadingBlock: { paddingTop: 48, alignItems: 'center', gap: 12 },
  muted: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },
  err: { color: '#f87171', paddingHorizontal: 20, marginBottom: 8 },
});
