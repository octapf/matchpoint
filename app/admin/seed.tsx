import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { setClipboardString } from '@/lib/clipboard';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { adminApi, type AdminDevSeedInfo } from '@/lib/api';
import { config } from '@/lib/config';

function formatDevSeedApiError(
  msg: string,
  t: (key: string, options?: Record<string, string | number>) => string
): string {
  if (msg.includes('Invalid or missing type') && !msg.includes('devSeedInfo')) {
    return t('admin.devSeedErrOldApi');
  }
  if (msg.includes('405') || /method not allowed/i.test(msg)) {
    return t('admin.devSeedErrPost405');
  }
  return msg;
}

function CopyChip({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
  const { t } = useTranslation();
  const [flash, setFlash] = useState(false);
  const onCopy = async () => {
    if (!value) return;
    await setClipboardString(value);
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  };
  const display =
    !value ? '—' : mask ? '*'.repeat(value.length) : value;
  return (
    <View style={styles.copyRow}>
      <View style={styles.copyTextCol}>
        <Text style={styles.copyLabel}>{label}</Text>
        <Text style={styles.copyValue} selectable={!mask}>
          {display}
        </Text>
      </View>
      <Pressable
        onPress={() => void onCopy()}
        disabled={!value}
        style={({ pressed }) => [
          styles.copyIconBtn,
          pressed && styles.copyBtnPressed,
          !value && styles.copyBtnDisabled,
          flash && styles.copyIconBtnFlash,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${t('common.copy')}`}
      >
        <Ionicons name="copy-outline" size={22} color={!value ? Colors.textMuted : '#1a1a1a'} />
      </Pressable>
    </View>
  );
}

export default function AdminSeedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [info, setInfo] = useState<AdminDevSeedInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config.api.isConfigured) {
      setError('API not configured');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await adminApi.devSeedInfo();
      setInfo(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      setError(formatDevSeedApiError(msg, t));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const runSeed = async (force: boolean) => {
    if (!config.api.isConfigured) return;
    setRunning(true);
    setError(null);
    try {
      const result = await adminApi.runDevSeed({ force });
      setInfo({
        exists: result.exists,
        tournamentId: result.tournamentId,
        inviteLink: result.inviteLink,
        password: result.password,
        users: result.users,
      });
      if (result.alreadyExists && !force) {
        Alert.alert(t('admin.devSeedTitle'), t('admin.devSeedAlreadyExists'));
      } else {
        const parts = [t('admin.devSeedDone')];
        if (result.teamsCount != null) parts.push(`${t('admin.teams')}: ${result.teamsCount}`);
        if (result.entriesCount != null) parts.push(`${t('admin.entries')}: ${result.entriesCount}`);
        Alert.alert(t('admin.devSeedTitle'), parts.join('\n'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      setError(formatDevSeedApiError(msg, t));
    } finally {
      setRunning(false);
    }
  };

  const confirmRegenerate = () => {
    Alert.alert(t('admin.devSeedRegenerateTitle'), t('admin.devSeedRegenerateConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.ok'), style: 'destructive', onPress: () => void runSeed(true) },
    ]);
  };

  const runPurge = async () => {
    if (!config.api.isConfigured) return;
    setRunning(true);
    setError(null);
    try {
      const result = await adminApi.purgeDevSeed();
      const r = result.removed;
      await load();
      const lines = [
        r.tournament ? t('admin.devSeedPurgeLineTournament') : null,
        t('admin.devSeedPurgeLineCounts', {
          teams: String(r.teams),
          entries: String(r.entries),
          users: String(r.users),
        }),
      ]
        .filter(Boolean)
        .join('\n');
      Alert.alert(t('admin.devSeedPurgeTitle'), lines);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      setError(formatDevSeedApiError(msg, t));
    } finally {
      setRunning(false);
    }
  };

  const confirmPurge = () => {
    Alert.alert(t('admin.devSeedPurgeTitle'), t('admin.devSeedPurgeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void runPurge() },
    ]);
  };

  const copyUsername = async (username: string) => {
    await setClipboardString(username);
    Alert.alert('', t('admin.devSeedCopied'));
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.yellow} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>{t('admin.devSeedIntro')}</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button
          title={t('admin.devSeedGenerate')}
          onPress={() => void runSeed(false)}
          disabled={running || !!info?.exists}
          fullWidth
        />
        <Button
          title={t('admin.devSeedRegenerate')}
          onPress={confirmRegenerate}
          disabled={running}
          variant="outline"
          fullWidth
        />
        <Button
          title={t('admin.devSeedPurge')}
          onPress={confirmPurge}
          disabled={running}
          variant="danger"
          fullWidth
        />
      </View>

      {info?.exists && info.tournamentId ? (
        <Button
          title={t('admin.devSeedOpenTournament')}
          onPress={() => router.push(`/tournament/${info.tournamentId}`)}
          variant="outline"
          fullWidth
        />
      ) : null}

      {running ? (
        <View style={styles.runningRow}>
          <ActivityIndicator color={Colors.yellow} />
          <Text style={styles.muted}>{t('common.loading')}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>{t('admin.devSeedCredentials')}</Text>
      <CopyChip label={t('admin.devSeedPassword')} value={info?.password ?? ''} mask />
      <CopyChip label={t('admin.devSeedTournamentId')} value={info?.tournamentId ?? ''} />
      <CopyChip label={t('admin.devSeedInvite')} value={info?.inviteLink ?? ''} mask />

      <Text style={styles.section}>{t('admin.devSeedUsernames')}</Text>
      <Text style={styles.hint}>{t('admin.devSeedUsernamesHint')}</Text>

      {(info?.users ?? []).map((u) => (
        <View key={u._id} style={styles.userRow}>
          <View style={styles.userMeta}>
            <Pressable onPress={() => router.push(`/profile/${u._id}` as never)}>
              <Text style={styles.userName}>
                {[u.firstName, u.lastName].filter(Boolean).join(' ')}
              </Text>
            </Pressable>
            <Text style={styles.userEmail} selectable>
              {u.email}
            </Text>
          </View>
          <Pressable
            onPress={() => void copyUsername(u.username)}
            style={({ pressed }) => [styles.usernameChip, pressed && styles.usernameChipPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.usernameText}>{u.username}</Text>
            <Text style={styles.tapCopy}>{t('admin.devSeedTapCopy')}</Text>
          </Pressable>
        </View>
      ))}

      {!info?.users?.length && info?.exists ? (
        <Text style={styles.muted}>{t('admin.devSeedNoUsers')}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  intro: { fontSize: 15, color: Colors.textSecondary, marginBottom: 16, lineHeight: 22 },
  err: { color: '#f87171', marginBottom: 12 },
  actions: { gap: 12, marginBottom: 20 },
  runningRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 10,
  },
  hint: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  muted: { fontSize: 14, color: Colors.textMuted },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  copyTextCol: { flex: 1, minWidth: 0 },
  copyLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  copyValue: { fontSize: 14, color: Colors.text, fontFamily: 'monospace' },
  copyIconBtn: {
    backgroundColor: Colors.yellow,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copyIconBtnFlash: { opacity: 0.75 },
  copyBtnPressed: { opacity: 0.88 },
  copyBtnDisabled: { opacity: 0.4 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.surfaceLight,
  },
  userMeta: { flex: 1, minWidth: 0 },
  userName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  userEmail: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  usernameChip: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'flex-end',
    maxWidth: '48%',
  },
  usernameChipPressed: { opacity: 0.9 },
  usernameText: { fontSize: 14, fontWeight: '600', color: Colors.yellow, fontFamily: 'monospace' },
  tapCopy: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
});
