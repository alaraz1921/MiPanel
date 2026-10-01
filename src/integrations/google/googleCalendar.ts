/**
 * Integración Google Calendar pendiente de la fase 3.
 * Empezar con solo lectura y ampliar permisos únicamente si se necesita edición.
 */
export const GOOGLE_CALENDAR_READ_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export const GOOGLE_CALENDAR_WRITE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export function isGoogleConfigured() {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}
