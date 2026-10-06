import type { CalendarEntry } from '../../types';

export const VISIBLE_DAY_ENTRIES = 3;

export function entriesForDay(entries: CalendarEntry[], date: string) {
  return entries.filter((entry) => entry.date === date).sort((left, right) =>
    (left.time ?? '').localeCompare(right.time ?? '') || left.title.localeCompare(right.title, 'es'));
}
