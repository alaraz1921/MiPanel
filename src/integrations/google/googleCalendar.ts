import type { CalendarEntry, CalendarEventFields } from '../../types';

export const GOOGLE_CALENDAR_READ_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export const GOOGLE_CALENDAR_WRITE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export type GoogleCalendarItem = { id: string; name: string; primary: boolean; color?: string; canEdit?: boolean };

type GoogleEvent = {
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  etag?: string;
  locked?: boolean;
  eventType?: string;
  recurringEventId?: string;
};

type GoogleSnapshotResponse = {
  calendars: Array<{ id: string; summary?: string; primary?: boolean; backgroundColor?: string; accessRole?: string }>;
  eventsByCalendar: Record<string, GoogleEvent[]>;
  canWriteEvents?: boolean;
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
  const metadata = {
    sourceId: event.id,
    sourceContainerId: calendar.id,
    etag: event.etag,
    timeZone: start.timeZone,
    canEdit: Boolean(calendar.canEdit && !event.locked && (!event.eventType || event.eventType === 'default')),
    recurring: Boolean(event.recurringEventId),
  };
  if (start.date) {
    return {
      id: `google-${calendar.id}-${event.id}`,
      title: event.summary?.trim() || 'Sin título',
      date: start.date,
      kind: 'event',
      source: 'google-calendar',
      calendarName: calendar.name,
      color: calendar.color,
      ...metadata,
      // Google usa una fecha de fin exclusiva; el editor muestra el último día incluido.
      endDate: event.end?.date ? shiftDate(event.end.date, -1) : start.date,
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
    ...metadata,
    endDate: event.end?.dateTime ? dateKey(new Date(event.end.dateTime)) : dateKey(value),
    endTime: event.end?.dateTime ? timePart(new Date(event.end.dateTime)) : timePart(value),
  };
}

export async function fetchGoogleCalendarSnapshot(
  accessToken: string,
  rangeStart: Date,
  rangeEnd: Date,
  calendarIds: string[],
  recheckAuthorization = false,
) {
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar`);
  url.searchParams.set('timeMin', rangeStart.toISOString());
  url.searchParams.set('timeMax', rangeEnd.toISOString());
  if (calendarIds.length) url.searchParams.set('calendarIds', calendarIds.join(','));
  if (recheckAuthorization) url.searchParams.set('recheckAuthorization', '1');
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
    canEdit: ['owner', 'writer', 'writerWithoutPrivateAccess'].includes(calendar.accessRole ?? ''),
  }));
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const events = Object.entries(payload.eventsByCalendar).flatMap(([calendarId, items]) => {
    const calendar = calendarById.get(calendarId);
    return calendar ? items.map((event) => normalizeEvent(event, calendar)).filter((event): event is CalendarEntry => Boolean(event)) : [];
  });
  return { calendars, events, canWriteEvents: Boolean(payload.canWriteEvents) };
}

function shiftDate(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function eventPatch(fields: CalendarEventFields, timeZone?: string) {
  const title = fields.title.trim();
  if (!title || title.length > 1024) throw new Error('Indica un título de hasta 1024 caracteres.');
  if (!fields.date || !fields.endDate || fields.endDate < fields.date) throw new Error('Revisa las fechas del evento.');
  if (!fields.time) return {
    summary: title,
    start: { date: fields.date, dateTime: null, timeZone: null },
    end: { date: shiftDate(fields.endDate, 1), dateTime: null, timeZone: null },
  };
  const start = new Date(`${fields.date}T${fields.time}`);
  const end = new Date(`${fields.endDate}T${fields.endTime ?? ''}`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error('La fecha y hora de fin deben ser posteriores al inicio.');
  }
  return {
    summary: title,
    start: { date: null, dateTime: start.toISOString(), ...(timeZone ? { timeZone } : {}) },
    end: { date: null, dateTime: end.toISOString(), ...(timeZone ? { timeZone } : {}) },
  };
}

export async function mutateGoogleEvent(accessToken: string, event: CalendarEntry, fields?: CalendarEventFields) {
  if (!event.sourceId || !event.sourceContainerId || !event.canEdit) throw new Error('Este evento es de solo lectura.');
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar`);
  url.searchParams.set('calendarId', event.sourceContainerId);
  url.searchParams.set('eventId', event.sourceId);
  const response = await fetch(url, {
    method: fields ? 'PATCH' : 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({ etag: event.etag, ...(fields ? { patch: eventPatch(fields, event.timeZone) } : {}) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
    throw new Error(payload?.error?.message ?? `Google Calendar respondió con el estado ${response.status}.`);
  }
  if (!fields) return;
  const updated = await response.json() as GoogleEvent;
  const normalized = normalizeEvent(updated, {
    id: event.sourceContainerId, name: event.calendarName ?? '', primary: false, color: event.color, canEdit: true,
  });
  if (!normalized) throw new Error('Google no devolvió un evento válido. Actualiza el calendario.');
  return normalized;
}
