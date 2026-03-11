import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Modal } from 'react-native';
import Colors from '@/constants/Colors';
import { formatTournamentDate, toISODate } from '@/lib/utils/dateFormat';

type DatePickerFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
  minDate?: Date;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getDaysInMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const days = last.getDate();
  return { startPad, days };
}

export function DatePickerField({
  value,
  onChange,
  label = 'Date',
  minDate = new Date(),
}: DatePickerFieldProps) {
  const [show, setShow] = useState(false);
  const displayValue = value ? formatTournamentDate(value) : 'Select date';

  const d = value ? new Date(value + 'T12:00:00') : new Date(minDate);
  const [viewYear, setViewYear] = useState(d.getFullYear());
  const [viewMonth, setViewMonth] = useState(d.getMonth());

  useEffect(() => {
    if (show) {
      const ref = value ? new Date(value + 'T12:00:00') : new Date(minDate);
      setViewYear(ref.getFullYear());
      setViewMonth(ref.getMonth());
    }
  }, [show, value, minDate]);

  const { startPad, days } = getDaysInMonth(viewYear, viewMonth);
  const minYear = minDate.getFullYear();
  const minMonth = minDate.getMonth();
  const minDay = minDate.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let i = 1; i <= days; i++) cells.push(i);

  const canPrev = viewYear > minYear || (viewYear === minYear && viewMonth > minMonth);
  const canNext = viewYear < minYear + 3;

  const selectDay = (day: number) => {
    const iso = toISODate(new Date(viewYear, viewMonth, day));
    const sel = new Date(iso + 'T12:00:00');
    const min = new Date(minYear, minMonth, minDay);
    if (sel >= min) {
      onChange(iso);
      setShow(false);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.field}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          min={toISODate(minDate)}
          style={{
            backgroundColor: Colors.surface,
            color: Colors.text,
            border: 'none',
            borderRadius: 12,
            padding: 16,
            fontSize: 16,
            width: '100%',
            boxSizing: 'border-box',
          } as React.CSSProperties}
        />
      </View>
    );
  }

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.input} onPress={() => setShow(true)}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>{displayValue}</Text>
      </Pressable>

      <Modal visible={show} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShow(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select date</Text>
              <Pressable onPress={() => setShow(false)}>
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.nav}>
              <Pressable
                style={[styles.navBtn, !canPrev && styles.navBtnDisabled]}
                onPress={() => {
                  if (viewMonth === 0) setViewYear((y) => y - 1);
                  setViewMonth((m) => (m === 0 ? 11 : m - 1));
                }}
                disabled={!canPrev}
              >
                <Text style={[styles.navBtnText, !canPrev && styles.navBtnTextDisabled]}>‹</Text>
              </Pressable>
              <Text style={styles.navTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
              <Pressable
                style={[styles.navBtn, !canNext && styles.navBtnDisabled]}
                onPress={() => {
                  if (viewMonth === 11) setViewYear((y) => y + 1);
                  setViewMonth((m) => (m === 11 ? 0 : m + 1));
                }}
                disabled={!canNext}
              >
                <Text style={[styles.navBtnText, !canNext && styles.navBtnTextDisabled]}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekdays}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={styles.weekday}>{w}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (day === null) return <View key={i} style={styles.cell} />;
                const iso = toISODate(new Date(viewYear, viewMonth, day));
                const sel = new Date(iso + 'T12:00:00');
                const min = new Date(minYear, minMonth, minDay);
                const disabled = sel < min;
                const selected = value === iso;
                return (
                  <Pressable
                    key={i}
                    style={[
                      styles.cell,
                      styles.cellDay,
                      selected && styles.cellSelected,
                      disabled && styles.cellDisabled,
                    ]}
                    onPress={() => !disabled && selectDay(day)}
                    disabled={disabled}
                  >
                    <Text style={[styles.cellText, selected && styles.cellTextSelected, disabled && styles.cellTextDisabled]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  inputText: { fontSize: 16, color: Colors.text },
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
    padding: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.text },
  modalDone: { fontSize: 16, fontWeight: '600', color: Colors.yellow },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { fontSize: 24, color: Colors.text, fontWeight: '300' },
  navBtnTextDisabled: { color: Colors.textMuted },
  navTitle: { fontSize: 18, fontWeight: '600', color: Colors.text },
  weekdays: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDay: {
    borderRadius: 20,
  },
  cellSelected: {
    backgroundColor: Colors.yellow,
  },
  cellDisabled: {
    opacity: 0.3,
  },
  cellText: { fontSize: 16, color: Colors.text },
  cellTextSelected: { color: '#1a1a1a', fontWeight: '600' },
  cellTextDisabled: { color: Colors.textMuted },
});
