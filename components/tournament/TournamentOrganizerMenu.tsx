import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/lib/theme/useTheme';

export type OrganizerMenuItem =
  | {
      kind?: 'item';
      key: string;
      label: string;
      icon: keyof typeof Ionicons.glyphMap;
      color: string;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }
  | {
      kind: 'section';
      key: string;
      label: string;
    };

type Props = {
  items: OrganizerMenuItem[];
  menuLabel: string;
  title?: string;
};

const ROW_ICON = 22;

/**
 * Tournament actions as a **bottom action sheet** (same pattern as iOS/Android share sheets).
 * No anchor math, no shrink-width — predictable and aligned with the screen + safe area.
 */
export function TournamentOrganizerMenu({ items, menuLabel, title }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const { tokens } = useTheme();

  const close = () => setOpen(false);

  return (
    <>
      <IconButton
        icon="menu-outline"
        onPress={() => setOpen(true)}
        accessibilityLabel={menuLabel}
        color={tokens.accent}
        compact
      />
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.root}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" />
          <View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            {title ? <Text style={styles.sheetTitle}>{String(title).toUpperCase()}</Text> : null}
            {items.map((item, index) =>
              item.kind === 'section' ? (
                <View
                  key={item.key}
                  style={[styles.sectionRow, index > 0 ? styles.sectionRowTopPad : null]}
                  accessibilityRole="text"
                >
                  <Text style={styles.sectionLabel}>{String(item.label).toUpperCase()}</Text>
                </View>
              ) : (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.row,
                    index < items.length - 1 && styles.rowBorder,
                    pressed && styles.rowPressed,
                    item.disabled && styles.rowDisabled,
                  ]}
                  onPress={() => {
                    if (item.disabled) return;
                    close();
                    item.onPress();
                  }}
                  disabled={item.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={item.accessibilityLabel ?? item.label}
                >
                  <Text style={styles.rowLabel} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <View style={styles.iconSlot}>
                    <Ionicons
                      name={item.icon}
                      size={ROW_ICON}
                      color={item.disabled ? Colors.textMuted : item.color}
                    />
                  </View>
                </Pressable>
              )
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceLight,
    borderBottomWidth: 0,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontStyle: 'italic',
    color: Colors.text,
    textAlign: 'right',
    paddingVertical: 10,
    paddingHorizontal: 12,
    letterSpacing: 0.9,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  rowPressed: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  iconSlot: {
    width: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: '500',
    color: Colors.text,
    textAlign: 'right',
  },
  sectionRow: {
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 12,
  },
  sectionRowTopPad: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceLight,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 1.1,
    color: Colors.textMuted,
    textAlign: 'right',
  },
});
