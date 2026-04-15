import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import type { TournamentDivision } from '@/types';
import { useTheme } from '@/lib/theme/useTheme';

const DIV_KEYS: TournamentDivision[] = ['men', 'women', 'mixed'];

export function OrganizeOnlyDivisionsModal({
  visible,
  onClose,
  title,
  subtitle,
  divisionLabel,
  confirmLabel,
  cancelLabel,
  divisionsEnabled,
  selected,
  onToggleDivision,
  onConfirm,
  confirmDisabled,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  divisionLabel: (d: TournamentDivision) => string;
  confirmLabel: string;
  cancelLabel: string;
  divisionsEnabled: TournamentDivision[];
  selected: Set<TournamentDivision>;
  onToggleDivision: (d: TournamentDivision) => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const list = DIV_KEYS.filter((d) => divisionsEnabled.includes(d));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {list.map((d) => {
            const on = selected.has(d);
            return (
              <Pressable
                key={d}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onToggleDivision(d)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <Text style={styles.rowLabel}>{divisionLabel(d)}</Text>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={on ? tokens.accent : Colors.textMuted}
                />
              </Pressable>
            );
          })}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, confirmDisabled && styles.confirmDisabled]}
              onPress={onConfirm}
              disabled={confirmDisabled}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.surfaceLight,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowLabel: {
    fontSize: 16,
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  cancelText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
  },
  confirmDisabled: {
    opacity: 0.45,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
});
