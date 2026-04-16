import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
// IMPORTANT: avoid importing from `react-native-calendars` package root.
// The root index pulls in CalendarList/NewCalendarList which depends on recyclerlistview,
// and Metro fails to bundle it in this workspace. Import only the modules we need.
import Calendar from 'react-native-calendars/src/calendar';
import CalendarProvider from 'react-native-calendars/src/expandableCalendar/Context/Provider';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import XDate from 'xdate';
import Colors from '@/constants/Colors';
import { useTheme } from '@/lib/theme/useTheme';
import { useTranslation } from '@/lib/i18n';
import type { Tournament } from '@/types';
import { eachLocalDayInclusive, formatTournamentDateRange, toISODate } from '@/lib/utils/dateFormat';
import { useLanguageStore } from '@/store/useLanguageStore';

type Props = {
  tournaments: Tournament[];
};

type MarkedDates = Record<string, unknown>;

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

  const { markedDates } = useMemo(() => {
    const marks: MarkedDates = {};

    for (const t of tournaments) {
      const dd = (t as any).divisionDates as Record<string, { startDate?: string; endDate?: string } | undefined> | undefined;
      const ranges = dd
        ? (['men', 'women', 'mixed'] as const)
            .map((k) => dd[k])
            .filter(Boolean)
            .map((r) => ({ startDate: String((r as any).startDate ?? '').trim(), endDate: String((r as any).endDate ?? '').trim() }))
            .filter((r) => !!r.startDate && !!r.endDate)
        : [];
      const rawStart = (ranges.map((r) => r.startDate).sort()[0] ?? (t.startDate || t.date)) as string | undefined;
      const rawEnd = (ranges.map((r) => r.endDate).sort().slice(-1)[0] ?? (t.endDate || rawStart)) as string | undefined;
      if (!rawStart) continue;

      const start = new Date(rawStart);
      const end = new Date(rawEnd || rawStart);
      if (!Number.isFinite(start.getTime())) continue;
      if (!Number.isFinite(end.getTime())) continue;

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
          color: tokens.accentMuted,
          textColor: Colors.text,
        } as any;
      }
    }

    return { markedDates: marks };
  }, [tournaments, tokens.accentMuted]);

  const monthTournaments = useMemo(() => {
    const [yStr, mStr] = activeMonthKey.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return [];
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0); // last day of month

    const out: Tournament[] = [];
    for (const t of tournaments) {
      const dd = (t as any).divisionDates as Record<string, { startDate?: string; endDate?: string } | undefined> | undefined;
      const ranges = dd
        ? (['men', 'women', 'mixed'] as const)
            .map((k) => dd[k])
            .filter(Boolean)
            .map((r) => ({ startDate: String((r as any).startDate ?? '').trim(), endDate: String((r as any).endDate ?? '').trim() }))
            .filter((r) => !!r.startDate && !!r.endDate)
        : [];
      const rawStart = (ranges.map((r) => r.startDate).sort()[0] ?? (t.startDate || t.date)) as string | undefined;
      const rawEnd = (ranges.map((r) => r.endDate).sort().slice(-1)[0] ?? (t.endDate || rawStart)) as string | undefined;
      if (!rawStart) continue;
      const s = new Date(rawStart);
      const e = new Date(rawEnd || rawStart);
      if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) continue;
      const start = s.getTime() <= e.getTime() ? s : e;
      const end = s.getTime() <= e.getTime() ? e : s;
      // intersection test
      if (end.getTime() < monthStart.getTime()) continue;
      if (start.getTime() > monthEnd.getTime()) continue;
      out.push(t);
    }
    out.sort((a, b) => {
      const as = String((a as any).startDate || (a as any).date || '');
      const bs = String((b as any).startDate || (b as any).date || '');
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
    }),
    [tokens]
  );

  const Legend = (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: tokens.accentMuted, borderColor: tokens.accentOutline }]} />
      <Text style={[styles.legendText, { color: Colors.textSecondary }]}>{t('common.tournament')}</Text>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.surfaceLight }]}>
      <CalendarProvider
        date={selectedDayKey}
        onDateChanged={(d) => setSelectedDayKey(d)}
        showTodayButton={false}
      >
        <Calendar
          firstDay={1}
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
          onMonthChange={(m: any) => {
            const y = Number(m?.year);
            const mo = Number(m?.month);
            if (!Number.isFinite(y) || !Number.isFinite(mo)) return;
            setActiveMonthKey(`${String(y)}-${String(mo).padStart(2, '0')}`);
          }}
          renderArrow={(direction: 'left' | 'right') => (
            <Ionicons
              name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
              size={18}
              color={tokens.accent}
            />
          )}
          dayComponent={({ date, state }: any) => {
            const dayKey = date?.dateString ?? '';
            const selected = dayKey === selectedDayKey;
            const isToday = dayKey === todayKey;
            const baseColor = state === 'disabled' ? Colors.textMuted : Colors.text;
            const textColor = isToday && !selected ? tokens.accent : baseColor;

            return (
              <Pressable
                onPress={() => dayKey && setSelectedDayKey(dayKey)}
                style={[styles.dayWrap, selected ? { borderColor: tokens.accent } : null]}
                accessibilityRole="button"
              >
                <Text style={[styles.dayText, { color: textColor }]}>{date?.day ?? ''}</Text>
                {isToday && !selected ? (
                  <View style={[styles.todayDot, { backgroundColor: tokens.accent }]} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </CalendarProvider>

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
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
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
  dayWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayText: {
    fontSize: 13,
    fontWeight: '700',
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});

