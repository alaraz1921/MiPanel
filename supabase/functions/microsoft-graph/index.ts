import { authenticatedUser, corsHeaders, json, serviceClient } from '../_shared/supabaseAuth.ts';
import { decryptCredential, encryptCredential } from '../_shared/credentialCipher.ts';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const TODO_PATH = /^\/me\/todo\/lists(?:\/[^/]+\/tasks(?:\/[^/]+)?)?$/;
const SNAPSHOT_PATH = '/me/todo/snapshot';
const accessTokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

async function graphAccessToken(userId: string) {
  const cached = accessTokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  const tenant = Deno.env.get('MICROSOFT_TENANT') ?? 'common';
  if (!clientId || !clientSecret) throw new Error('La integración Microsoft no está terminada de configurar.');

  const supabase = serviceClient();
  const { data: credential, error } = await supabase
    .from('microsoft_credentials')
    .select('refresh_token_ciphertext')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!credential) throw new Error('Vuelve a conectar Microsoft para completar la configuración segura.');

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: await decryptCredential(credential.refresh_token_ciphertext),
      scope: 'offline_access https://graph.microsoft.com/Tasks.ReadWrite',
    }),
  });
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown; refresh_token?: unknown };
  if (!response.ok || typeof payload.access_token !== 'string') throw new Error('Microsoft no pudo renovar la autorización.');

  if (typeof payload.refresh_token === 'string') {
    const { error: updateError } = await supabase.from('microsoft_credentials').upsert({
      user_id: userId,
      refresh_token_ciphertext: await encryptCredential(payload.refresh_token),
    });
    if (updateError) throw updateError;
  }
  const expiresInSeconds = typeof payload.expires_in === 'number' && payload.expires_in > 0
    ? payload.expires_in
    : 300;
  accessTokenCache.set(userId, {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (expiresInSeconds * 1000),
  });
  return payload.access_token;
}

type GraphCollection<T> = { value: T[]; '@odata.nextLink'?: string };
type GraphTodoList = { id: string; displayName: string };

async function graphCollection<T>(initialUrl: string, accessToken: string) {
  const values: T[] = [];
  let nextUrl: string | undefined = initialUrl;
  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Microsoft Graph respondió con el estado ${response.status}.`);
    const page = await response.json() as GraphCollection<T>;
    values.push(...page.value);
    nextUrl = page['@odata.nextLink'];
  }
  return values;
}

async function todoSnapshot(userId: string) {
  const accessToken = await graphAccessToken(userId);
  const lists = await graphCollection<GraphTodoList>(`${GRAPH_ROOT}/me/todo/lists`, accessToken);
  const taskCollections = await Promise.all(lists.map(async (list) => [
    list.id,
    await graphCollection<unknown>(
      `${GRAPH_ROOT}/me/todo/lists/${encodeURIComponent(list.id)}/tasks`,
      accessToken,
    ),
  ] as const));
  return { lists, tasksByList: Object.fromEntries(taskCollections) };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return json({ error: 'Método no permitido.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Falta la sesión de MiPanel.' }, 401);

  let user;
  try {
    user = await authenticatedUser(authorization);
  } catch {
    return json({ error: 'Sesión de MiPanel no válida.' }, 401);
  }

  const input = new URL(request.url);
  const path = input.searchParams.get('path') ?? '';
  if (path === SNAPSHOT_PATH) {
    if (request.method !== 'GET') return json({ error: 'Método no permitido.' }, 405);
    try {
      return json(await todoSnapshot(user.id));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Error desconocido';
      console.error('No se pudo cargar el resumen de Microsoft To Do.', detail);
      return json({ error: { code: 'MiPanelBackend', message: detail } }, 502);
    }
  }
  if (!TODO_PATH.test(path)) return json({ error: 'Ruta de Microsoft To Do no permitida.' }, 403);

  try {
    let body: string | undefined;
    if (request.method !== 'GET' && request.method !== 'DELETE') body = await request.text();
    const graphResponse = await fetch(`${GRAPH_ROOT}${path}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${await graphAccessToken(user.id)}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
    });
    const responseText = await graphResponse.text();
    return new Response(responseText, {
      status: graphResponse.status,
      headers: { ...corsHeaders, 'Content-Type': graphResponse.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    console.error('No se pudo completar la llamada a Microsoft Graph.', detail);
    const safeMessage = [
      'La integración Microsoft no está terminada de configurar.',
      'Vuelve a conectar Microsoft para completar la configuración segura.',
      'Microsoft no pudo renovar la autorización.',
      'Falta la clave de cifrado de credenciales.',
      'La clave de cifrado debe tener 32 bytes en Base64.',
      'Credencial cifrada no válida.',
    ].includes(detail)
      ? detail
      : 'El backend de Microsoft no está disponible temporalmente.';
    return json({ error: { code: 'MiPanelBackend', message: safeMessage } }, 502);
  }
});
