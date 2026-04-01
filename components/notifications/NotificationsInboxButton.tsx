import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { useTranslation } from '@/lib/i18n';
import { useUserStore } from '@/store/useUserStore';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { NotificationsInboxPanel } from '@/components/notifications/NotificationsInboxPanel';

export function NotificationsInboxButton() {
  const { t } = useTranslation();
  const user = useUserStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { data: notifications = [] } = useNotifications({ limit: 50, enabled: !!user });

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  if (!user) {
    return null;
  }

  const badgeLabel =
    unreadCount > 9 ? '9+' : unreadCount > 0 ? String(unreadCount) : '';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.hit}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.notifications')}
      >
        <Ionicons name="notifications-outline" size={22} color="#ffffff" />
        {unreadCount > 0 ? (
          <View style={styles.badge} accessibilityElementsHidden>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setOpen(false)}
      >
        {open ? (
          <View style={[styles.modalRoot, { paddingTop: Math.max(insets.top, 12) }]}>
            <NotificationsInboxPanel onClose={() => setOpen(false)} />
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
