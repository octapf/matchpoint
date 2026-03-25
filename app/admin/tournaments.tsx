import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { adminApi } from '@/lib/api';
import { config } from '@/lib/config';
import type { Tournament } from '@/types';

function isTournament(x: unknown): x is Tournament {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as Tournament)._id === 'string' &&
    typeof (x as Tournament).name === 'string'
  );
}

export default function AdminTournamentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Tournament[]>([]);
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
      const raw = await adminApi.tournaments({ limit: '100' });
      setItems(raw.filter(isTournament));
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
      <Stack.Screen options={{ title: t('admin.tournamentsScreenTitle') }} />
      <View style={styles.container}>
        <Text style={styles.hint}>{t('admin.tournamentListHint')}</Text>
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
                <Text style={styles.muted}>{t('admin.noTournaments')}</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Pressable
                  style={({ pressed }) => [styles.rowLead, pressed && styles.rowPressed]}
                  onPress={() => router.push(`/tournament/${item._id}`)}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.startDate ? new Date(item.startDate).toLocaleDateString() : '—'} · {item.status}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.editBtn, pressed && styles.rowPressed]}
                  onPress={() => router.push(`/admin/tournament/${item._id}` as never)}
                >
                  <Text style={styles.editBtnText}>{t('admin.edit')}</Text>
                </Pressable>
              </View>
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
    alignItems: 'stretch',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
    marginBottom: 10,
    overflow: 'hidden',
  },
  rowLead: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 8,
    minWidth: 0,
  },
  rowPressed: { opacity: 0.92 },
  rowMain: { flex: 1, marginRight: 8 },
  editBtn: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderLeftWidth: 1,
    borderLeftColor: Colors.surfaceLight,
    backgroundColor: Colors.surface,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.yellow,
  },
  rowTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  chevron: { fontSize: 22, color: Colors.textMuted, fontWeight: '300' },
  loadingBlock: { paddingTop: 48, alignItems: 'center', gap: 12 },
  muted: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },
  err: { color: '#f87171', paddingHorizontal: 20, marginBottom: 8 },
});
