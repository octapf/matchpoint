/**
 * Tournament date formatting utilities.
 * API stores dates as ISO strings (YYYY-MM-DD).
 */
import { i18n } from '@/lib/i18n';

/** Format ISO date for display (e.g. "Jul 15, 2026") */
export function formatTournamentDate(dateStr?: string, locale?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(locale || i18n.locale || 'en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Get ISO date string YYYY-MM-DD from Date (uses local date to avoid timezone shift) */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Iterate local calendar days between start and end (inclusive). */
export function eachLocalDayInclusive(start: Date, end: Date): Date[] {
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return [];
  const out: Date[] = [];
  const dir = s.getTime() <= e.getTime() ? 1 : -1;
  const cur = new Date(s);
  for (let i = 0; i < 400; i++) {
    out.push(new Date(cur));
    if (cur.getFullYear() === e.getFullYear() && cur.getMonth() === e.getMonth() && cur.getDate() === e.getDate()) {
      break;
    }
    cur.setDate(cur.getDate() + dir);
  }
  return out;
}

/** Format date range for display. Single day: "Jul 15, 2026". Multi-day: "Jul 15 – 18, 2026" or "Jul 15 – Aug 2, 2026" */
export function formatTournamentDateRange(start: string, end?: string, locale?: string): string {
  const activeLocale = locale || i18n.locale || 'en';
  const s = formatTournamentDate(start, activeLocale);
  if (!end || end === start) return s;
  const endD = new Date(end + 'T12:00:00');
  const startD = new Date(start + 'T12:00:00');
  if (isNaN(endD.getTime())) return s;
  const sameMonth = startD.getMonth() === endD.getMonth() && startD.getFullYear() === endD.getFullYear();
  if (sameMonth) {
    const endStr = endD.toLocaleDateString(activeLocale, { day: 'numeric', year: 'numeric' });
    const startParts = s.split(' ');
    return `${startParts[0]} ${startParts[1].replace(/,/, '')} – ${endStr}`;
  }
  return `${s} – ${formatTournamentDate(end, activeLocale)}`;
}
