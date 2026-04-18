import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  PanResponder,
  Animated,
  Easing,
  I18nManager,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Colors from '@/constants/Colors';
import { useTranslation } from '@/lib/i18n';
import { formatTournamentDate, toISODate } from '@/lib/utils/dateFormat';
import { useTheme } from '@/lib/theme/useTheme';

type DatePickerFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
  minDate?: Date;
  fieldStyle?: StyleProp<ViewStyle>;
  size?: 'md' | 'sm';
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
  fieldStyle,
  size = 'md',
}: DatePickerFieldProps) {
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<'calendar' | 'year'>('calendar');
  const locale = i18n.locale || 'en';
  const displayValue = value ? formatTournamentDate(value, locale) : t('common.selectDate');

  const today = useMemo(() => new Date(), []);
  const minRef = useMemo(() => new Date(minDate), [minDate]);
  const valueRef = value ? new Date(value + 'T12:00:00') : null;
  const d = (() => {
    if (valueRef && valueRef >= minRef) return valueRef;
    if (today >= minRef) return today;
    return minRef;
  })();
  const [viewYear, setViewYear] = useState(d.getFullYear());
  const [viewMonth, setViewMonth] = useState(d.getMonth());

  const slideX = useRef(new Animated.Value(0)).current;
  const layoutW = useRef(320);
  const monthAnimating = useRef(false);
  const [monthTransitioning, setMonthTransitioning] = useState(false);

  useEffect(() => {
    if (show) {
      const ref = (() => {
        const v = value ? new Date(value + 'T12:00:00') : null;
        if (v && v >= minRef) return v;
        if (today >= minRef) return today;
        return minRef;
      })();
      setViewYear(ref.getFullYear());
      setViewMonth(ref.getMonth());
      setMode('calendar');
      slideX.setValue(0);
      monthAnimating.current = false;
    }
  }, [show, value, today, minRef, slideX]);

  const { startPad, days } = getDaysInMonth(viewYear, viewMonth);
  const minYear = minRef.getFullYear();
  const minMonth = minRef.getMonth();
  const minDay = minRef.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let i = 1; i <= days; i++) cells.push(i);

  const localizedMonths = MONTHS.map((_, idx) =>
    new Date(2026, idx, 1).toLocaleDateString(locale, { month: 'short' })
  );
  const localizedWeekdays = WEEKDAYS.map((_, idx) =>
    new Date(2026, 0, idx + 4).toLocaleDateString(locale, { weekday: 'short' })
  );

  const canPrev = viewYear > minYear || (viewYear === minYear && viewMonth > minMonth);
  const maxYear = Math.max(minYear + 20, new Date().getFullYear() + 10);
  const canNext = viewYear < maxYear || (viewYear === maxYear && viewMonth < 11);

  const applyPrevMonth = useCallback(() => {
    if (mode !== 'calendar' || !canPrev) return;
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, [mode, canPrev]);

  const applyNextMonth = useCallback(() => {
    if (mode !== 'calendar' || !canNext) return;
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, [mode, canNext]);

  const carouselDeltas = (direction: 1 | -1, w: number) => {
    const rtl = I18nManager.isRTL;
    if (direction === 1) {
      return { exitTo: rtl ? w : -w, enterFrom: rtl ? -w : w };
    }
    return { exitTo: rtl ? -w : w, enterFrom: rtl ? w : -w };
  };

  const animateMonthChange = useCallback(
    (direction: 1 | -1, apply: () => void) => {
      if (mode !== 'calendar' || monthAnimating.current) return;
      if (direction === 1 && !canNext) return;
      if (direction === -1 && !canPrev) return;
      const w = Math.max(220, layoutW.current);
      const { exitTo, enterFrom } = carouselDeltas(direction, w);
      monthAnimating.current = true;
      setMonthTransitioning(true);
      Animated.timing(slideX, {
        toValue: exitTo,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          monthAnimating.current = false;
          setMonthTransitioning(false);
          return;
        }
        apply();
        slideX.setValue(enterFrom);
        Animated.timing(slideX, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          monthAnimating.current = false;
          setMonthTransitioning(false);
        });
      });
    },
    [mode, canNext, canPrev, slideX]
  );

  const goPrevCalendarMonth = useCallback(() => {
    animateMonthChange(-1, applyPrevMonth);
  }, [animateMonthChange, applyPrevMonth]);

  const goNextCalendarMonth = useCallback(() => {
    animateMonthChange(1, applyNextMonth);
  }, [animateMonthChange, applyNextMonth]);

  const calendarMonthSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          mode === 'calendar' &&
          !monthTransitioning &&
          Math.abs(g.dx) > 14 &&
          Math.abs(g.dx) > Math.abs(g.dy) + 6,
        onPanResponderRelease: (_, g) => {
          if (mode !== 'calendar' || monthTransitioning) return;
          const threshold = 44;
          if (g.dx < -threshold) goNextCalendarMonth();
          else if (g.dx > threshold) goPrevCalendarMonth();
        },
      }),
    [mode, monthTransitioning, goNextCalendarMonth, goPrevCalendarMonth],
  );

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
    const padding = size === 'sm' ? 12 : 16;
    const fontSize = size === 'sm' ? 14 : 16;
    return (
      <View style={[styles.field, fieldStyle]}>
        {label ? <Text style={[styles.label, size === 'sm' && styles.labelSm]}>{label}</Text> : null}
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
            padding,
            fontSize,
            width: '100%',
            boxSizing: 'border-box',
          } as React.CSSProperties}
        />
      </View>
    );
  }

  return (
    <View style={[styles.field, fieldStyle]}>
      {label ? <Text style={[styles.label, size === 'sm' && styles.labelSm]}>{label}</Text> : null}
      <Pressable style={[styles.input, size === 'sm' && styles.inputSm]} onPress={() => setShow(true)}>
        <Text style={[styles.inputText, size === 'sm' && styles.inputTextSm, !value && styles.placeholder]}>
          {displayValue}
        </Text>
      </Pressable>

      <Modal visible={show} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShow(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('common.selectDate')}</Text>
              <Pressable onPress={() => setShow(false)}>
                <Text style={[styles.modalDone, { color: tokens.accent }]}>{t('common.done')}</Text>
              </Pressable>
            </View>

            {mode === 'year' ? (
              <>
                <View style={styles.nav}>
                  <Pressable style={[styles.navBtn, styles.navBtnDisabled]} disabled accessibilityRole="button">
                    <Text style={[styles.navBtnText, styles.navBtnTextDisabled]}>‹</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.selectDate')}
                    onPress={() => setMode('calendar')}
                    style={styles.navTitleBtn}
                  >
                    <Text style={styles.navTitle}>
                      {localizedMonths[viewMonth]} {viewYear}
                    </Text>
                    <Text style={styles.navTitleHint}>▲</Text>
                  </Pressable>
                  <Pressable style={[styles.navBtn, styles.navBtnDisabled]} disabled accessibilityRole="button">
                    <Text style={[styles.navBtnText, styles.navBtnTextDisabled]}>›</Text>
                  </Pressable>
                </View>
                <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGrid} showsVerticalScrollIndicator={false}>
                {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map((y) => {
                  const selected = y === viewYear;
                  return (
                    <Pressable
                      key={y}
                      style={[styles.yearCell, selected && styles.yearCellSelected, selected && { backgroundColor: tokens.accent }]}
                      onPress={() => {
                        setViewYear(y);
                        setMode('calendar');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={String(y)}
                    >
                      <Text style={[styles.yearCellText, selected && styles.yearCellTextSelected]}>{y}</Text>
                    </Pressable>
                  );
                })}
                </ScrollView>
              </>
            ) : (
              <View style={styles.monthCarouselClip} {...calendarMonthSwipe.panHandlers}>
                <Animated.View
                  style={{ transform: [{ translateX: slideX }] }}
                  onLayout={(e) => {
                    const lw = e.nativeEvent.layout.width;
                    if (lw > 0) layoutW.current = lw;
                  }}
                >
                  <View style={styles.nav}>
                    <Pressable
                      style={[styles.navBtn, (!canPrev || monthTransitioning) && styles.navBtnDisabled]}
                      onPress={goPrevCalendarMonth}
                      disabled={!canPrev || monthTransitioning}
                    >
                      <Text style={[styles.navBtnText, (!canPrev || monthTransitioning) && styles.navBtnTextDisabled]}>‹</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('common.selectDate')}
                      onPress={() => setMode('year')}
                      style={styles.navTitleBtn}
                      disabled={monthTransitioning}
                    >
                      <Text style={styles.navTitle}>
                        {localizedMonths[viewMonth]} {viewYear}
                      </Text>
                      <Text style={styles.navTitleHint}>▼</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.navBtn, (!canNext || monthTransitioning) && styles.navBtnDisabled]}
                      onPress={goNextCalendarMonth}
                      disabled={!canNext || monthTransitioning}
                    >
                      <Text style={[styles.navBtnText, (!canNext || monthTransitioning) && styles.navBtnTextDisabled]}>›</Text>
                    </Pressable>
                  </View>
                  <View style={styles.weekdays}>
                    {localizedWeekdays.map((w) => (
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
                            selected && { backgroundColor: tokens.accent },
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
                </Animated.View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, marginBottom: 8 },
  labelSm: { fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
  },
  inputSm: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
  inputText: { fontSize: 16, color: Colors.text },
  inputTextSm: { fontSize: 14 },
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
  monthCarouselClip: {
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: Colors.text },
  modalDone: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
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
  navTitleBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8 },
  navTitle: { fontSize: 18, fontWeight: '600', color: Colors.text },
  navTitleHint: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
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
    backgroundColor: Colors.surfaceLight,
  },
  cellDisabled: {
    opacity: 0.3,
  },
  cellText: { fontSize: 16, color: Colors.text },
  cellTextSelected: { color: '#1a1a1a', fontWeight: '600' },
  cellTextDisabled: { color: Colors.textMuted },
  yearScroll: { maxHeight: 320 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 6 },
  yearCell: {
    width: '30%',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearCellSelected: { backgroundColor: Colors.surfaceLight },
  yearCellText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  yearCellTextSelected: { color: '#1a1a1a' },
});
