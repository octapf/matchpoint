import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { adminApi } from '@/lib/api';
import { config } from '@/lib/config';

export default function AdminHomeScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ users: number; tournaments: number; entries: number; teams: number } | null>(
    null
  );
  const [tournamentCount, setTournamentCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
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
      const list = await adminApi.tournaments({ limit: '100' });
      setTournamentCount(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={Colors.yellow} />}
    >
      <Text style={styles.title}>{t('admin.title')}</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {stats ? (
        <View style={styles.card}>
          <Text style={styles.row}>{t('admin.users')}: {stats.users}</Text>
          <Text style={styles.row}>{t('admin.tournaments')}: {stats.tournaments}</Text>
          <Text style={styles.row}>{t('admin.entries')}: {stats.entries}</Text>
          <Text style={styles.row}>{t('admin.teams')}: {stats.teams}</Text>
          {tournamentCount !== null ? (
            <Text style={styles.muted}>{t('admin.recentTournamentsListed', { count: tournamentCount })}</Text>
          ) : null}
        </View>
      ) : loading ? (
        <Text style={styles.muted}>{t('common.loading')}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 16 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  row: { fontSize: 16, color: Colors.text },
  muted: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },
  err: { color: '#f87171', marginBottom: 12 },
});
