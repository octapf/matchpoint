import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, FlatList, type ListRenderItem } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';
import { THEME_PRESETS, type ThemePresetId } from '@/lib/theme/colors';
import { useThemeStore } from '@/store/useThemeStore';

type ThemePresetSelectProps = {
  label: string;
  /** Optional: called after selection changes */
  onChange?: (id: ThemePresetId) => void;
  /** Hide the field label above the select */
  showFieldLabel?: boolean;
  /** Show the label inside the select button */
  showLabelInInput?: boolean;
  /** Optional style overrides */
  fieldStyle?: object;
  inputStyle?: object;
};

export function ThemePresetSelect({
  label,
  onChange,
  showFieldLabel = true,
  showLabelInInput = false,
  fieldStyle,
  inputStyle,
}: ThemePresetSelectProps) {
  const [open, setOpen] = useState(false);
  const presetId = useThemeStore((s) => s.presetId);
  const setPresetId = useThemeStore((s) => s.setPresetId);
  const insets = useSafeAreaInsets();

  const items = useMemo(() => Object.values(THEME_PRESETS), []);
  const selected = presetId && presetId in THEME_PRESETS ? presetId : items[0]!.id;
  const selectedLabel = THEME_PRESETS[selected].label;

  const renderItem: ListRenderItem<(typeof items)[number]> = useCallback(
    ({ item }) => {
      const isSel = item.id === selected;
      return (
        <Pressable
          style={[styles.optionRow, isSel && styles.optionRowSelected]}
          onPress={() => {
            setPresetId(item.id);
            onChange?.(item.id);
            setOpen(false);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${item.label}`}
        >
          <View style={styles.optionLeft}>
            <View style={styles.swatches}>
              <View style={[styles.swatch, { backgroundColor: item.tokens.accent }]} />
              <View style={[styles.swatch, { backgroundColor: item.tokens.accentSecondary }]} />
            </View>
            <Text style={styles.optionText}>{item.label}</Text>
          </View>
          {isSel ? <Ionicons name="checkmark" size={22} color={item.tokens.accent} /> : null}
        </Pressable>
      );
    },
    [label, onChange, selected, setPresetId]
  );

  return (
    <View style={[styles.field, fieldStyle]}>
      {showFieldLabel ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.input, inputStyle]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.inputLeft}>
          <View style={styles.swatches}>
            <View style={[styles.swatch, { backgroundColor: THEME_PRESETS[selected].tokens.accent }]} />
            <View style={[styles.swatch, { backgroundColor: THEME_PRESETS[selected].tokens.accentSecondary }]} />
          </View>
          <Text style={styles.inputText} numberOfLines={1}>
            {showLabelInInput ? `${label} · ${selectedLabel}` : selectedLabel}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <FlatList
              data={items}
              keyExtractor={(x) => x.id}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.listScroll}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  inputLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  inputText: { flex: 1, fontSize: 14, color: Colors.text },
  swatches: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 12, height: 12, borderRadius: 999 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
  listScroll: { maxHeight: 420 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceLight,
  },
  optionRowSelected: { backgroundColor: 'rgba(255,255,255,0.06)' },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  optionText: { fontSize: 16, color: Colors.text, flex: 1 },
});

