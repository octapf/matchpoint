import React, { useCallback, useState } from 'react';
import { Stack } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { adminApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { User } from '@/types';

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

  React.useEffect(() => {
    void load();
  }, [load]);

  const showUserDetail = (u: User) => {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.displayName || '—';
    Alert.alert(
      u.email,
      [name, u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser'), `ID: ${u._id}`].join('\n')
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t('admin.usersScreenTitle') }} />
      <View style={styles.container}>
        <Text style={styles.hint}>{t('admin.usersListHint')}</Text>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {loading && items.length === 0 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={Colors.yellow} />
            <Text style={styles.muted}>{t('common.loading')}</Text>
          </View>
        ) : (
          <FlatList
            style={styles.list}
            data={items}
            keyExtractor={(row) => row._id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.yellow} />}
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.muted}>{t('admin.noUsers')}</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => showUserDetail(item)}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.displayName || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.email}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.email}
                  </Text>
                </View>
                <View style={[styles.badge, item.role === 'admin' && styles.badgeAdmin]}>
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    marginBottom: 10,
  },
  rowPressed: { opacity: 0.92 },
  rowMain: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  badgeAdmin: {
    backgroundColor: Colors.violet,
  },
  badgeText: {
    fontSize: 12,
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
