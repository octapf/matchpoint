import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { useTranslation } from '@/lib/i18n';
import { useNotifications, useMarkNotificationsRead, useMarkAllNotificationsRead } from '@/lib/hooks/useNotifications';
import { Button } from '@/components/ui/Button';
import type { Notification } from '@/types';

function notificationLabel(n: Notification, t: (k: string, o?: Record<string, any>) => string): { title: string; body: string } {
  const params = (n.params ?? {}) as Record<string, any>;
  const titleKey = `notifications.${n.type}.title`;
  const bodyKey = `notifications.${n.type}.body`;
  return {
    title: t(titleKey, params),
    body: t(bodyKey, params),
  };
}

export default function NotificationsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: notifications = [], isLoading } = useNotifications({ limit: 50 });
  const markRead = useMarkNotificationsRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  const open = (n: Notification) => {
    const tid = typeof n.data?.tournamentId === 'string' ? n.data.tournamentId : '';
    const mid = typeof n.data?.matchId === 'string' ? n.data.matchId : '';
    if (tid && mid) router.push(`/tournament/${tid}/match/${mid}` as never);
    else if (tid) router.push(`/tournament/${tid}` as never);

    if (!n.readAt) {
      markRead.mutate({ ids: [n._id] });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('notifications.inbox')}</Text>
        <Button
          title={t('notifications.markAllRead')}
          variant="outline"
          size="sm"
          onPress={() => markAllRead.mutate()}
          disabled={markAllRead.isPending || unreadCount === 0}
        />
      </View>

      {isLoading ? <Text style={styles.muted}>{t('common.loading')}</Text> : null}

      {notifications.length === 0 && !isLoading ? (
        <Text style={styles.muted}>{t('notifications.empty')}</Text>
      ) : (
        <FlashList
          data={notifications}
          keyExtractor={(n) => n._id}
          renderItem={({ item }) => {
            const { title, body } = notificationLabel(item, t);
            const unread = !item.readAt;
            return (
              <Pressable
                onPress={() => open(item)}
                style={[styles.row, unread ? styles.rowUnread : null]}
                accessibilityRole="button"
              >
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, unread ? styles.rowTitleUnread : null]} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.rowBody} numberOfLines={2}>
                    {body}
                  </Text>
                </View>
                {unread ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  muted: { color: Colors.textMuted, padding: 10, textAlign: 'center' },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowUnread: { borderWidth: 1, borderColor: Colors.yellow },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  rowTitleUnread: { color: Colors.yellow },
  rowBody: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  dot: { width: 10, height: 10, borderRadius: 999, backgroundColor: Colors.yellow },
});

