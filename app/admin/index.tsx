import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { adminApi } from '@/lib/api';
import { config } from '@/lib/config';
import { Button } from '@/components/ui/Button';
import { AdminNavRow } from '@/components/admin/AdminNavRow';

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statTile} accessibilityRole="text">
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function AdminHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [stats, setStats] = useState<{ users: number; tournaments: number; entries: number; teams: number } | null>(
    null
  );
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
      const s = await adminApi.stats();
      setStats(s);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.yellow} />}
    >
      <Text style={styles.subtitle}>{t('admin.overview')}</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}

      {stats ? (
        <>
          <View style={styles.grid}>
            <View style={styles.statRow}>
              <StatTile label={t('admin.users')} value={stats.users} />
              <StatTile label={t('admin.tournaments')} value={stats.tournaments} />
            </View>
            <View style={styles.statRow}>
              <StatTile label={t('admin.entries')} value={stats.entries} />
              <StatTile label={t('admin.teams')} value={stats.teams} />
            </View>
          </View>
          <Text style={[styles.subtitle, styles.subtitleSpaced]}>{t('admin.actions')}</Text>
          <View style={styles.actionsColumn}>
            <Button title={t('admin.createTournament')} onPress={() => router.push('/tournament/create')} size="sm" fullWidth />
            <AdminNavRow
              title={t('admin.browseTournaments')}
              subtitle={t('admin.browseTournamentsSub')}
              onPress={() => router.push('/admin/tournaments')}
            />
            <AdminNavRow
              title={t('admin.browseUsers')}
              subtitle={t('admin.browseUsersSub')}
              onPress={() => router.push('/admin/users')}
            />
            <AdminNavRow
              title={t('admin.devSeedBrowse')}
              subtitle={t('admin.devSeedBrowseSub')}
              onPress={() => router.push('/admin/seed')}
            />
          </View>
        </>
      ) : loading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={Colors.yellow} />
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40, flexGrow: 1 },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  subtitleSpaced: {
    marginTop: 28,
  },
  actionsColumn: {
    gap: 12,
  },
  grid: { gap: 12 },
  statRow: { flexDirection: 'row', gap: 12 },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  loadingBlock: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  muted: { fontSize: 14, color: Colors.textMuted },
  err: { color: '#f87171', marginBottom: 12 },
});
