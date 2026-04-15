import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  type ListRenderItem,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@/lib/i18n';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';

const MIN = 2;
const MAX = 64;
/** Row height must match `optionRow` padding + text (used by getItemLayout / scroll). */
const ROW_HEIGHT = 49;
/** Open the list scrolled near this team count (index = value − MIN). */
const SCROLL_ANCHOR_INDEX = 14 - MIN;

function snapToRange(n: number): number {
  if (!Number.isFinite(n)) return 16;
  return Math.min(MAX, Math.max(MIN, Math.round(n)));
}

type MaxTeamsSelectProps = {
  label?: string;
  value: string;
  onChange: (maxTeams: string) => void;
};

export function MaxTeamsSelect({ label, value, onChange }: MaxTeamsSelectProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const listRef = useRef<FlatList<number>>(null);

  const options = useMemo(
    () => Array.from({ length: MAX - MIN + 1 }, (_, i) => i + MIN),
    [],
  );

  const parsed = parseInt(value, 10);
  const selected = Number.isFinite(parsed) && options.includes(parsed) ? parsed : snapToRange(parsed);

  const displayLine = t('tournaments.maxTeamsOption', { count: selected });

  const selectedIndex = Math.min(options.length - 1, Math.max(0, selected - MIN));

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      /** Open around 14 when selection is in the lower range; otherwise center the selected row. */
      const index =
        selectedIndex <= SCROLL_ANCHOR_INDEX
          ? Math.min(options.length - 1, SCROLL_ANCHOR_INDEX)
          : selectedIndex;
      listRef.current?.scrollToIndex({
        index,
        viewPosition: 0.45,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open, options.length, selectedIndex]);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  const onScrollToIndexFailed = useCallback(
    (info: { averageItemLength: number; index: number }) => {
      const offset = info.index * ROW_HEIGHT;
      listRef.current?.scrollToOffset({ offset, animated: false });
    },
    [],
  );

  const renderItem: ListRenderItem<number> = useCallback(
    ({ item: n }) => {
      const isSel = selected === n;
      const line = t('tournaments.maxTeamsOption', { count: n });
      return (
        <Pressable
          style={[styles.optionRow, isSel && styles.optionRowSelected]}
          onPress={() => {
            onChange(String(n));
            setOpen(false);
          }}
        >
          <Text style={[styles.optionText, isSel && styles.optionTextSelected]}>{line}</Text>
          {isSel ? <Ionicons name="checkmark" size={22} color={tokens.accent} /> : null}
        </Pressable>
      );
    },
    [onChange, selected, t, tokens.accent],
  );

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={styles.input}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.inputText} numberOfLines={1}>
          {displayLine}
        </Text>
        <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('tournaments.selectMaxTeams')}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={[styles.modalDone, { color: tokens.accent }]}>{t('common.done')}</Text>
              </Pressable>
            </View>
            <FlatList
              ref={listRef}
              data={options}
              keyExtractor={(n) => String(n)}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.listScroll}
              onScrollToIndexFailed={onScrollToIndexFailed}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 20 },
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
  inputText: { flex: 1, fontSize: 16, color: Colors.text },
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
    paddingVertical: 14,
    minHeight: ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  optionRowSelected: { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  optionText: { fontSize: 16, color: Colors.text, flex: 1, paddingRight: 12 },
  optionTextSelected: { fontWeight: '600' },
});
