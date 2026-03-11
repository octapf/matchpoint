/**
 * Tournament date formatting utilities.
 * API stores dates as ISO strings (YYYY-MM-DD).
 */

/** Format ISO date for display (e.g. "Jul 15, 2026") */
export function formatTournamentDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

/** Format date range for display. Single day: "Jul 15, 2026". Multi-day: "Jul 15 – 18, 2026" or "Jul 15 – Aug 2, 2026" */
export function formatTournamentDateRange(start: string, end?: string): string {
  const s = formatTournamentDate(start);
  if (!end || end === start) return s;
  const endD = new Date(end + 'T12:00:00');
  const startD = new Date(start + 'T12:00:00');
  if (isNaN(endD.getTime())) return s;
  const sameMonth = startD.getMonth() === endD.getMonth() && startD.getFullYear() === endD.getFullYear();
  if (sameMonth) {
    const endStr = endD.toLocaleDateString('en-US', { day: 'numeric', year: 'numeric' });
    const startParts = s.split(' ');
    return `${startParts[0]} ${startParts[1].replace(/,/, '')} – ${endStr}`;
  }
  return `${s} – ${formatTournamentDate(end)}`;
}
