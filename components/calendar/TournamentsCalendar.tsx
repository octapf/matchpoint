import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
// IMPORTANT: avoid importing from `react-native-calendars` package root.
// The root index pulls in CalendarList/NewCalendarList which depends on recyclerlistview,
// and Metro fails to bundle it in this workspace. Import only the modules we need.
import Calendar from 'react-native-calendars/src/calendar';
import CalendarProvider from 'react-native-calendars/src/expandableCalendar/Context/Provider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import XDate from 'xdate';
import Colors from '@/constants/Colors';
import { readableTextOnBackground } from '@/lib/theme/colors';
import { useTheme } from '@/lib/theme/useTheme';
import { useTranslation } from '@/lib/i18n';
import type { Tournament } from '@/types';
import { eachLocalDayInclusive, formatTournamentDateRange, toISODate } from '@/lib/utils/dateFormat';
import { useLanguageStore } from '@/store/useLanguageStore';

/** Behaviour, Metro imports, theme-merge pitfalls: see `docs/TOURNAMENTS_CALENDAR.md`. */

type Props = {
  tournaments: Tournament[];
};

type MarkedDates = Record<string, unknown>;

/** Override Provider `contextWrapper` flex:1 so width stays correct inside vertical ScrollViews. */
const calendarProviderStyle = { width: '100%' as const, flex: 0 as const };

let calendarLocalesConfigured = false;
function ensureCalendarLocalesConfigured() {
  if (calendarLocalesConfigured) return;
  calendarLocalesConfigured = true;

  XDate.locales.en = {
    monthNames: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    today: 'Today',
  };

  XDate.locales.es = {
    monthNames: [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ],
    monthNamesShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    today: 'Hoy',
  };

  XDate.locales.it = {
    monthNames: [
      'Gennaio',
      'Febbraio',
      'Marzo',
      'Aprile',
      'Maggio',
      'Giugno',
      'Luglio',
      'Agosto',
      'Settembre',
      'Ottobre',
      'Novembre',
      'Dicembre',
    ],
    monthNamesShort: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
    dayNames: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
    dayNamesShort: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
    today: 'Oggi',
  };
}

function clampMaxDays(start: Date, end: Date, maxDays: number): Date {
  const out = new Date(start);
  out.setDate(out.getDate() + maxDays - 1);
  return out.getTime() < end.getTime() ? out : end;
}

function parseTournamentScheduleDate(raw?: string): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // API stores calendar dates as YYYY-MM-DD. Parsing that alone is timezone-sensitive; anchor to local noon.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function pickTournamentScheduleIso(t: Tournament): { rawStart?: string; rawEnd?: string } {
  const dd = (t as any).divisionDates as Record<string, { startDate?: string; endDate?: string } | undefined> | undefined;
  const ranges = dd
    ? (['men', 'women', 'mixed'] as const)
        .map((k) => dd[k])
        .filter(Boolean)
        .map((r) => ({ startDate: String((r as any).startDate ?? '').trim(), endDate: String((r as any).endDate ?? '').trim() }))
        .filter((r) => !!r.startDate && !!r.endDate)
    : [];

  const fromDivStart = ranges.map((r) => r.startDate).sort()[0];
  const fromDivEnd = ranges.map((r) => r.endDate).sort().slice(-1)[0];

  const start =
    String(fromDivStart ?? '').trim() ||
    String((t as any).startDate ?? '').trim() ||
    String((t as any).date ?? '').trim() ||
    String((t as any).createdAt ?? '').trim();

  const end =
    String(fromDivEnd ?? '').trim() ||
    String((t as any).endDate ?? '').trim() ||
    start;

  return { rawStart: start || undefined, rawEnd: end || undefined };
}

export function TournamentsCalendar({ tournaments }: Props) {
  const { tokens } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const language = useLanguageStore((s) => s.language ?? 'en');

  useEffect(() => {
    ensureCalendarLocalesConfigured();
    const key = language === 'es' || language === 'it' || language === 'en' ? language : 'en';
    XDate.defaultLocale = key;
  }, [language]);

  const todayKey = useMemo(() => toISODate(new Date()), []);
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [activeMonthKey, setActiveMonthKey] = useState(() => todayKey.slice(0, 7)); // YYYY-MM
  const prevMonthKeyRef = useRef<string | null>(null);
  const calendarWidthRef = useRef(360);
  const slideX = useSharedValue(0);
  const fadeMonth = useSharedValue(1);

  const calendarMonthAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: fadeMonth.value,
  }));

  const markedDates = useMemo(() => {
    const marks: MarkedDates = {};
    const tournamentFill = tokens.accent;
    const tournamentDayNumberColor =
      readableTextOnBackground(tournamentFill, tokens) === 'light' ? tokens.lightText : tokens.darkText;

    for (const t of tournaments) {
      const { rawStart, rawEnd } = pickTournamentScheduleIso(t);
      if (!rawStart) continue;

      const start = parseTournamentScheduleDate(rawStart);
      const end = parseTournamentScheduleDate(rawEnd || rawStart);
      if (!start || !end) continue;

      const s = start.getTime() <= end.getTime() ? start : end;
      const e = start.getTime() <= end.getTime() ? end : start;
      const safeEnd = clampMaxDays(s, e, 62);

      const days = eachLocalDayInclusive(s, safeEnd);
      if (days.length === 0) continue;

      for (let i = 0; i < days.length; i++) {
        const dayKey = toISODate(days[i]!);
        // Period marks (range bar). If it is a single-day tournament, still mark as period.
        const isStart = i === 0;
        const isEnd = i === days.length - 1;
        const existing = (marks[dayKey] as any) ?? {};
        // If multiple tournaments overlap, keep it marked and keep the strongest color.
        // (We don't attempt to show multiple colors; keeping it simple and fast.)
        marks[dayKey] = {
          ...(existing ?? {}),
          startingDay: existing.startingDay ?? isStart,
          endingDay: existing.endingDay ?? isEnd,
          color: tournamentFill,
          textColor: tournamentDayNumberColor,
        } as any;
      }
    }

    return marks;
  }, [tournaments, tokens]);

  const monthTournaments = useMemo(() => {
    const [yStr, mStr] = activeMonthKey.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0); // last day of month

    const out: Tournament[] = [];
    for (const t of tournaments) {
      const { rawStart, rawEnd } = pickTournamentScheduleIso(t);
      if (!rawStart) continue;
      const s = parseTournamentScheduleDate(rawStart);
      const e = parseTournamentScheduleDate(rawEnd || rawStart);
      if (!s || !e) continue;
      const start = s.getTime() <= e.getTime() ? s : e;
      const end = s.getTime() <= e.getTime() ? e : s;
      // intersection test
      if (end.getTime() < monthStart.getTime()) continue;
      if (start.getTime() > monthEnd.getTime()) continue;
      out.push(t);
    }
    out.sort((a, b) => {
      const as = pickTournamentScheduleIso(a).rawStart || '';
      const bs = pickTournamentScheduleIso(b).rawStart || '';
      if (as !== bs) return as.localeCompare(bs);
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return out;
  }, [activeMonthKey, tournaments]);

  const onPressTournament = useCallback(
    (t: Tournament) => {
      router.push(`/tournament/${t._id}` as never);
    },
    [router]
  );

  const handleCalendarMonthChange = useCallback((m: { year?: unknown; month?: unknown }) => {
    const y = Number(m?.year);
    const mo = Number(m?.month);
    if (!Number.isFinite(y) || !Number.isFinite(mo)) return;
    const nextKey = `${String(y)}-${String(mo).padStart(2, '0')}`;
    const prevKey = prevMonthKeyRef.current;
    prevMonthKeyRef.current = nextKey;
    setActiveMonthKey(nextKey);

    if (prevKey === null || prevKey === nextKey) {
      return;
    }
    const forward = nextKey > prevKey;
    const rtl = I18nManager.isRTL;
    const sign = rtl ? (forward ? -1 : 1) : forward ? 1 : -1;
    const w = calendarWidthRef.current;
    const distance = Math.min(100, Math.max(40, w * 0.22));
    slideX.value = sign * distance;
    fadeMonth.value = 0.88;
    slideX.value = withSpring(0, { damping: 17, stiffness: 210, mass: 0.82 });
    fadeMonth.value = withSpring(1, { damping: 14, stiffness: 200 });
  }, []);

  useEffect(() => {
    prevMonthKeyRef.current = todayKey.slice(0, 7);
  }, [todayKey]);

  const calendarTheme = useMemo(
    () => ({
      backgroundColor: tokens.surface,
      calendarBackground: tokens.surface,
      textSectionTitleColor: Colors.textSecondary,
      selectedDayBackgroundColor: 'transparent',
      selectedDayTextColor: Colors.text,
      todayTextColor: tokens.accent,
      dayTextColor: Colors.text,
      textDisabledColor: Colors.textMuted,
      dotColor: tokens.accent,
      selectedDotColor: tokens.accent,
      arrowColor: tokens.accent,
      monthTextColor: Colors.text,
      textMonthFontWeight: '700',
      textDayFontWeight: '600',
      textDayHeaderFontWeight: '600',
      /** Reinforce row layout for weekday names (library default; avoids rare flex glitches in scroll parents). */
      ['stylesheet.calendar.header' as string]: {
        week: { marginTop: 7, flexDirection: 'row', justifyContent: 'space-around' },
      },
    }),
    [tokens]
  );

  const Legend = (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: tokens.accent, borderColor: tokens.accentOutline }]} />
      <Text style={[styles.legendText, { color: Colors.textSecondary }]}>{t('common.tournament')}</Text>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.surfaceLight }]}>
      <Animated.View
        style={[styles.calendarAnimClip, calendarMonthAnimStyle]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) calendarWidthRef.current = w;
        }}
      >
        <CalendarProvider
          date={selectedDayKey}
          onDateChanged={(d) => setSelectedDayKey(d)}
          showTodayButton={false}
          style={calendarProviderStyle}
        >
          <Calendar
            firstDay={1}
            enableSwipeMonths
            markingType="period"
            markedDates={{
              ...markedDates,
              [selectedDayKey]: {
                ...(markedDates[selectedDayKey] as any),
                selected: true,
              } as any,
            }}
            theme={calendarTheme as any}
            onDayPress={(d: any) => setSelectedDayKey(String(d?.dateString ?? ''))}
            onMonthChange={handleCalendarMonthChange}
            renderArrow={(direction: 'left' | 'right') => (
              <Ionicons
                name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
                size={18}
                color={tokens.accent}
              />
            )}
          />
        </CalendarProvider>
      </Animated.View>

      {Legend}

      <View style={styles.dayList}>
        {monthTournaments.length > 0 ? (
          monthTournaments.map((t) => (
            <Pressable
              key={t._id}
              onPress={() => onPressTournament(t)}
              style={({ pressed }) => [
                styles.tournamentRow,
                { backgroundColor: tokens.surfaceLight, borderColor: tokens.surfaceLight },
                pressed ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t.name}
            >
              <Text style={[styles.tournamentName, { color: Colors.text }]} numberOfLines={1}>
                {t.name}
              </Text>
              <Text style={[styles.tournamentMeta, { color: Colors.textSecondary }]} numberOfLines={1}>
                {formatTournamentDateRange(t.startDate || t.date || '', t.endDate)}
              </Text>
              <Text style={[styles.tournamentMeta, { color: Colors.textMuted }]} numberOfLines={1}>
                {t.location || '—'}
              </Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyText}>{t('feed.noTournamentsThisMonth')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  calendarAnimClip: {
    width: '100%',
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  legendSwatch: {
    width: 18,
    height: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dayList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  tournamentRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  tournamentName: {
    fontSize: 14,
    fontWeight: '700',
  },
  tournamentMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
});

