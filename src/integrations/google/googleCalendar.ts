import type { CalendarEntry } from '../../types';

export const GOOGLE_CALENDAR_READ_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export type GoogleCalendarItem = { id: string; name: string; primary: boolean; color?: string };

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type GoogleSnapshotResponse = {
  calendars: Array<{ id: string; summary?: string; primary?: boolean; backgroundColor?: string }>;
  eventsByCalendar: Record<string, GoogleEvent[]>;
};

export function isGoogleConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function dateKey(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function timePart(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function normalizeEvent(event: GoogleEvent, calendar: GoogleCalendarItem): CalendarEntry | undefined {
  const start = event.start;
  if (!start?.date && !start?.dateTime) return undefined;
  if (start.date) {
    return {
      id: `google-${calendar.id}-${event.id}`,
      title: event.summary?.trim() || 'Sin título',
      date: start.date,
      kind: 'event',
      source: 'google-calendar',
      calendarName: calendar.name,
      color: calendar.color,
    };
  }
  const value = new Date(start.dateTime!);
  if (Number.isNaN(value.getTime())) return undefined;
  return {
    id: `google-${calendar.id}-${event.id}`,
    title: event.summary?.trim() || 'Sin título',
    date: dateKey(value),
    time: timePart(value),
    kind: 'event',
    source: 'google-calendar',
    calendarName: calendar.name,
    color: calendar.color,
  };
}

export async function fetchGoogleCalendarSnapshot(
  accessToken: string,
  rangeStart: Date,
  rangeEnd: Date,
  calendarIds: string[],
) {
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar`);
  url.searchParams.set('timeMin', rangeStart.toISOString());
  url.searchParams.set('timeMax', rangeEnd.toISOString());
  if (calendarIds.length) url.searchParams.set('calendarIds', calendarIds.join(','));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => undefined) as (GoogleSnapshotResponse & { error?: { message?: string } }) | undefined;
  if (!response.ok || !payload) {
    throw new Error(payload?.error?.message || `Google Calendar respondió con el estado ${response.status}.`);
  }
  const calendars = payload.calendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.summary?.trim() || 'Calendario sin nombre',
    primary: Boolean(calendar.primary),
    color: calendar.backgroundColor,
  }));
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const events = Object.entries(payload.eventsByCalendar).flatMap(([calendarId, items]) => {
    const calendar = calendarById.get(calendarId);
    return calendar ? items.map((event) => normalizeEvent(event, calendar)).filter((event): event is CalendarEntry => Boolean(event)) : [];
  });
  return { calendars, events };
}
