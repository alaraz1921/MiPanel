import { authenticatedUser, corsHeaders, json, serviceClient } from '../_shared/supabaseAuth.ts';
import { decryptCredential, encryptCredential } from '../_shared/credentialCipher.ts';

const GOOGLE_ROOT = 'https://www.googleapis.com/calendar/v3';
const accessTokenCache = new Map<string, { accessToken: string; expiresAt: number; ciphertext: string; canWriteEvents: boolean }>();

async function googleAccessToken(userId: string, forceRenewal = false) {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('La integración Google no está terminada de configurar.');

  const supabase = serviceClient();
  const { data: credential, error } = await supabase
    .from('google_credentials')
    .select('refresh_token_ciphertext')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!credential) throw new Error('Vuelve a conectar Google para completar la configuración segura.');
  const cached = accessTokenCache.get(userId);
  if (!forceRenewal && cached && cached.ciphertext === credential.refresh_token_ciphertext && cached.expiresAt > Date.now() + 60_000) return cached;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: await decryptCredential(credential.refresh_token_ciphertext),
    }),
  });
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown; scope?: unknown };
  if (!response.ok || typeof payload.access_token !== 'string') throw new Error('Google no pudo renovar la autorización.');

  let ciphertext = credential.refresh_token_ciphertext;
  if (typeof payload.refresh_token === 'string') {
    ciphertext = await encryptCredential(payload.refresh_token);
    const { error: updateError } = await supabase.from('google_credentials').upsert({
      user_id: userId,
      refresh_token_ciphertext: ciphertext,
    });
    if (updateError) throw updateError;
  }
  const expiresIn = typeof payload.expires_in === 'number' && payload.expires_in > 0 ? payload.expires_in : 300;
  let scope = payload.scope;
  // OAuth permite omitir scope. Consultarlo a Google, no asumir que se perdió
  // el permiso ni confiar en una marca enviada por el navegador.
  if (typeof scope !== 'string' || !scope.trim()) {
    const infoResponse = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${payload.access_token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
    });
    const info = await infoResponse.json().catch(() => undefined) as { scope?: unknown } | undefined;
    if (!infoResponse.ok || typeof info?.scope !== 'string' || !info.scope.trim()) {
      throw new Error('No se pudieron comprobar los permisos de Google. Actualiza el calendario para volver a intentarlo.');
    }
    scope = info.scope;
  }
  const scopes = (scope as string).split(/\s+/);
  const token = {
    accessToken: payload.access_token, expiresAt: Date.now() + (expiresIn * 1000), ciphertext,
    canWriteEvents: scopes.includes('https://www.googleapis.com/auth/calendar.events') || scopes.includes('https://www.googleapis.com/auth/calendar'),
  };
  accessTokenCache.set(userId, token);
  return token;
}

type GoogleCollection<T> = { items?: T[]; nextPageToken?: string };
type GoogleCalendar = { id: string; summary?: string; primary?: boolean; backgroundColor?: string; accessRole?: string };

async function googleCollection<T>(initialUrl: string, accessToken: string) {
  const items: T[] = [];
  let url: string | undefined = initialUrl;
  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Google Calendar respondió con el estado ${response.status}.`);
    const page = await response.json() as GoogleCollection<T>;
    items.push(...(page.items ?? []));
    url = page.nextPageToken ? `${initialUrl}&pageToken=${encodeURIComponent(page.nextPageToken)}` : undefined;
  }
  return items;
}

async function snapshot(userId: string, timeMin: string, timeMax: string, requestedIds: string[], forceRenewal = false) {
  const { accessToken, canWriteEvents } = await googleAccessToken(userId, forceRenewal);
  const calendars = await googleCollection<GoogleCalendar>(
    `${GOOGLE_ROOT}/users/me/calendarList?minAccessRole=reader&maxResults=250`,
    accessToken,
  );
  const permittedIds = requestedIds.length
    ? calendars.filter((calendar) => requestedIds.includes(calendar.id)).map((calendar) => calendar.id)
    : calendars.map((calendar) => calendar.id);
  const eventsByCalendar: Record<string, unknown[]> = {};
  for (const calendarId of permittedIds) {
    const query = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults: '2500',
    });
    eventsByCalendar[calendarId] = await googleCollection<unknown>(
      `${GOOGLE_ROOT}/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
      accessToken,
    );
  }
  return { calendars, eventsByCalendar, canWriteEvents };
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function validatedEventPatch(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Datos del evento no válidos.');
  const fields = input as Record<string, unknown>;
  if (typeof fields.summary !== 'string' || !fields.summary.trim() || fields.summary.length > 1024) throw new Error('Título no válido.');
  const start = fields.start as Record<string, unknown> | undefined;
  const end = fields.end as Record<string, unknown> | undefined;
  if (!start || !end) throw new Error('Faltan las fechas del evento.');
  if (validDate(start.date) && validDate(end.date) && end.date > start.date && !start.dateTime && !end.dateTime) {
    return { summary: fields.summary.trim(), start: { date: start.date, dateTime: null, timeZone: null }, end: { date: end.date, dateTime: null, timeZone: null } };
  }
  const validTimestamp = (value: unknown): value is string => typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  if (!validTimestamp(start.dateTime) || !validTimestamp(end.dateTime) || Date.parse(end.dateTime) <= Date.parse(start.dateTime) || start.date || end.date) {
    throw new Error('La fecha y hora de fin deben ser posteriores al inicio.');
  }
  function dateTimeFields(value: Record<string, unknown>) {
    if (value.timeZone !== undefined) {
      if (typeof value.timeZone !== 'string' || value.timeZone.length > 100) throw new Error('Zona horaria no válida.');
      new Intl.DateTimeFormat('es', { timeZone: value.timeZone });
    }
    return { date: null, dateTime: value.dateTime, ...(value.timeZone ? { timeZone: value.timeZone } : {}) };
  }
  return { summary: fields.summary.trim(), start: dateTimeFields(start), end: dateTimeFields(end) };
}

async function mutateEvent(request: Request, input: URL, userId: string) {
  const calendarId = input.searchParams.get('calendarId');
  const eventId = input.searchParams.get('eventId');
  if (!calendarId || calendarId.length > 1024 || !eventId || !/^[a-zA-Z0-9_-]{1,1024}$/.test(eventId)) {
    return json({ error: { message: 'Identificador de evento no válido.' } }, 400);
  }
  let body;
  let patch;
  try {
    const text = await request.text();
    if (text.length > 12_000) throw new Error('Datos del evento demasiado grandes.');
    body = JSON.parse(text) as { etag?: unknown; patch?: unknown };
    if (!body || typeof body !== 'object' || typeof body.etag !== 'string' || !/^"[^"\r\n]{1,200}"$/.test(body.etag)) {
      throw new Error('Actualiza el calendario antes de modificar el evento.');
    }
    if (request.method === 'PATCH') patch = validatedEventPatch(body.patch);
  } catch (error) {
    return json({ error: { message: error instanceof Error ? error.message : 'Datos del evento no válidos.' } }, 400);
  }
  const { accessToken, canWriteEvents } = await googleAccessToken(userId);
  if (!canWriteEvents) return json({ error: { message: 'Autoriza la edición de Google para modificar eventos.' } }, 403);
  const calendarUrl = `${GOOGLE_ROOT}/users/me/calendarList/${encodeURIComponent(calendarId)}`;
  const calendarResponse = await fetch(calendarUrl, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!calendarResponse.ok) return json({ error: { message: 'No se pudo comprobar el acceso a este calendario. Actualiza y vuelve a intentarlo.' } }, calendarResponse.status);
  const calendar = await calendarResponse.json() as GoogleCalendar;
  if (!['owner', 'writer', 'writerWithoutPrivateAccess'].includes(calendar.accessRole ?? '')) {
    return json({ error: { message: 'Este calendario es de solo lectura.' } }, 403);
  }
  const response = await fetch(`${GOOGLE_ROOT}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: request.method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'If-Match': body.etag as string },
    signal: AbortSignal.timeout(15_000),
    ...(patch ? { body: JSON.stringify(patch) } : {}),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Vuelve a conectar Google.',
      403: 'Google no permite modificar este evento. Revisa la autorización de edición y los permisos del calendario.',
      404: 'El evento ya no existe. Actualiza el calendario.',
      410: 'El evento ya se eliminó. Actualiza el calendario.',
      412: 'El evento ha cambiado desde que se cargó. Actualiza el calendario antes de editarlo o borrarlo.',
      429: 'Google está limitando las peticiones. Espera unos segundos e inténtalo de nuevo.',
    };
    return json({ error: { message: messages[response.status] ?? `Google Calendar respondió con el estado ${response.status}.` } }, response.status);
  }
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: corsHeaders });
  return json(await response.json());
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'PATCH', 'DELETE'].includes(request.method)) return json({ error: 'Método no permitido.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Falta la sesión de MiPanel.' }, 401);

  let user;
  try {
    user = await authenticatedUser(authorization);
  } catch {
    return json({ error: 'Sesión de MiPanel no válida.' }, 401);
  }

  const input = new URL(request.url);
  if (request.method === 'GET' && input.searchParams.get('checkConnection') === '1') {
    try {
      const { canWriteEvents } = await googleAccessToken(user.id, true);
      return json({ connected: true, canWriteEvents });
    } catch {
      return json({ error: { message: 'No se pudo renovar la conexión guardada de Google. Si persiste, desconecta solo Google y vuelve a conectarlo.' } }, 502);
    }
  }
  if (request.method !== 'GET') {
    try {
      return await mutateEvent(request, input, user.id);
    } catch {
      return json({ error: { message: 'No se pudo modificar el evento. Comprueba la conexión de Google y vuelve a intentarlo.' } }, 502);
    }
  }
  const timeMin = input.searchParams.get('timeMin') ?? '';
  const timeMax = input.searchParams.get('timeMax') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(timeMin) || !/^\d{4}-\d{2}-\d{2}T/.test(timeMax)) {
    return json({ error: 'Intervalo de calendario no válido.' }, 400);
  }
  const calendarIds = (input.searchParams.get('calendarIds') ?? '').split(',').filter(Boolean);
  try {
    return json(await snapshot(user.id, timeMin, timeMax, calendarIds, input.searchParams.get('recheckAuthorization') === '1'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    console.error('No se pudo cargar Google Calendar.', detail);
    return json({ error: { code: 'MiPanelGoogle', message: detail } }, 502);
  }
});
