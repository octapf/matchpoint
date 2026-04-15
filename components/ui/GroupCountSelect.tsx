import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { getValidGroupCountsForMaxTeams } from '@/lib/tournamentGroups';
import { useTheme } from '@/lib/theme/useTheme';

type GroupCountSelectProps = {
  label?: string;
  /** Current max teams (parsed). Used to compute valid group counts. */
  maxTeams: number;
  /** Group count as string (digits), same as TextInput before. */
  value: string;
  onChange: (groupCount: string) => void;
};

export function GroupCountSelect({ label, maxTeams, value, onChange }: GroupCountSelectProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);

  const options = useMemo(() => getValidGroupCountsForMaxTeams(maxTeams), [maxTeams]);

  const parsed = parseInt(value, 10);
  const selected = Number.isFinite(parsed) && options.includes(parsed) ? parsed : options[0];

  const displayLine =
    selected !== undefined
      ? t('tournaments.groupCountOption', {
          groups: selected,
          perGroup: Math.floor(maxTeams / selected),
        })
      : t('tournaments.noValidGroupCount');

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.input, options.length === 0 && styles.inputDisabled]}
        onPress={() => options.length > 0 && setOpen(true)}
        disabled={options.length === 0}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.inputText, options.length === 0 && styles.placeholder]} numberOfLines={1}>
          {options.length === 0 ? t('tournaments.noValidGroupCount') : displayLine}
        </Text>
        <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('tournaments.selectGroupCount')}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={[styles.modalDone, { color: tokens.accent }]}>{t('common.done')}</Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.listScroll}
            >
              {options.map((gc) => {
                const perGroup = Math.floor(maxTeams / gc);
                const isSel = selected === gc;
                const line = t('tournaments.groupCountOption', { groups: gc, perGroup });
                return (
                  <Pressable
                    key={gc}
                    style={[styles.optionRow, isSel && styles.optionRowSelected]}
                    onPress={() => {
                      onChange(String(gc));
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>{line}</Text>
                    {isSel ? <Ionicons name="checkmark" size={22} color={tokens.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  inputDisabled: { opacity: 0.65 },
  inputText: { flex: 1, fontSize: 16, color: Colors.text },
  placeholder: { color: Colors.textMuted },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  modalTitle: { fontSize: 17, fontWeight: '600', color: Colors.text },
  modalDone: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  listScroll: { maxHeight: 360 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  optionRowSelected: { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  optionText: { fontSize: 16, color: Colors.text, flex: 1, paddingRight: 12 },
  optionTextSelected: { fontWeight: '600' },
});
