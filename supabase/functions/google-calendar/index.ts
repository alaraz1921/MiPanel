import { authenticatedUser, corsHeaders, json, serviceClient } from '../_shared/supabaseAuth.ts';
import { decryptCredential, encryptCredential } from '../_shared/credentialCipher.ts';

const GOOGLE_ROOT = 'https://www.googleapis.com/calendar/v3';
const accessTokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

async function googleAccessToken(userId: string) {
  const cached = accessTokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

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

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: await decryptCredential(credential.refresh_token_ciphertext),
    }),
  });
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
  if (!response.ok || typeof payload.access_token !== 'string') throw new Error('Google no pudo renovar la autorización.');

  if (typeof payload.refresh_token === 'string') {
    const { error: updateError } = await supabase.from('google_credentials').upsert({
      user_id: userId,
      refresh_token_ciphertext: await encryptCredential(payload.refresh_token),
    });
    if (updateError) throw updateError;
  }
  const expiresIn = typeof payload.expires_in === 'number' && payload.expires_in > 0 ? payload.expires_in : 300;
  accessTokenCache.set(userId, { accessToken: payload.access_token, expiresAt: Date.now() + (expiresIn * 1000) });
  return payload.access_token;
}

type GoogleCollection<T> = { items?: T[]; nextPageToken?: string };
type GoogleCalendar = { id: string; summary?: string; primary?: boolean; backgroundColor?: string };

async function googleCollection<T>(initialUrl: string, accessToken: string) {
  const items: T[] = [];
  let url: string | undefined = initialUrl;
  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Calendar respondió con el estado ${response.status}.`);
    const page = await response.json() as GoogleCollection<T>;
    items.push(...(page.items ?? []));
    url = page.nextPageToken ? `${initialUrl}&pageToken=${encodeURIComponent(page.nextPageToken)}` : undefined;
  }
  return items;
}

async function snapshot(userId: string, timeMin: string, timeMax: string, requestedIds: string[]) {
  const accessToken = await googleAccessToken(userId);
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
  return { calendars, eventsByCalendar };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Falta la sesión de MiPanel.' }, 401);

  let user;
  try {
    user = await authenticatedUser(authorization);
  } catch {
    return json({ error: 'Sesión de MiPanel no válida.' }, 401);
  }

  const input = new URL(request.url);
  const timeMin = input.searchParams.get('timeMin') ?? '';
  const timeMax = input.searchParams.get('timeMax') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(timeMin) || !/^\d{4}-\d{2}-\d{2}T/.test(timeMax)) {
    return json({ error: 'Intervalo de calendario no válido.' }, 400);
  }
  const calendarIds = (input.searchParams.get('calendarIds') ?? '').split(',').filter(Boolean);
  try {
    return json(await snapshot(user.id, timeMin, timeMax, calendarIds));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    console.error('No se pudo cargar Google Calendar.', detail);
    return json({ error: { code: 'MiPanelGoogle', message: detail } }, 502);
  }
});
