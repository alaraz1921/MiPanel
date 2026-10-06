import { authenticatedUser, corsHeaders, json, serviceClient } from '../_shared/supabaseAuth.ts';
import { decryptCredential, encryptCredential } from '../_shared/credentialCipher.ts';
import { MicrosoftAuthorizationError, renewMicrosoftToken } from '../_shared/microsoftToken.ts';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const TODO_PATH = /^\/me\/todo\/lists(?:\/[^/]+\/tasks(?:\/[^/]+)?)?$/;
const SNAPSHOT_PATH = '/me/todo/snapshot';
const accessTokenCache = new Map<string, { accessToken: string; expiresAt: number }>();
const tokenRenewals = new Map<string, Promise<string>>();

async function graphAccessToken(userId: string) {
  const cached = accessTokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;
  const pending = tokenRenewals.get(userId);
  if (pending) return pending;
  const renewal = renewGraphAccessToken(userId);
  tokenRenewals.set(userId, renewal);
  try {
    return await renewal;
  } finally {
    tokenRenewals.delete(userId);
  }
}

async function renewGraphAccessToken(userId: string) {
  const supabase = serviceClient();
  const { data: credential, error } = await supabase
    .from('microsoft_credentials')
    .select('refresh_token_ciphertext')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!credential) throw new MicrosoftAuthorizationError('Vuelve a conectar Microsoft para completar la configuración segura.', 401, 'MicrosoftReconnectRequired');
  const token = await renewMicrosoftToken(await decryptCredential(credential.refresh_token_ciphertext));
  // No sobrescribir credenciales más nuevas guardadas por otro login o instancia.
  const { error: updateError } = await supabase.from('microsoft_credentials').update({
    refresh_token_ciphertext: await encryptCredential(token.refreshToken),
  }).eq('user_id', userId).eq('refresh_token_ciphertext', credential.refresh_token_ciphertext);
  if (updateError) throw updateError;
  accessTokenCache.set(userId, {
    accessToken: token.accessToken,
    expiresAt: Date.now() + (token.expiresIn * 1000),
  });
  return token.accessToken;
}

type GraphCollection<T> = { value: T[]; '@odata.nextLink'?: string };
type GraphTodoList = { id: string; displayName: string };
const MAX_GRAPH_RETRIES = 3;

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(retryDate - Date.now(), 0);
  }
  return 1000 * (2 ** attempt);
}

async function graphCollection<T>(initialUrl: string, accessToken: string) {
  const values: T[] = [];
  let nextUrl: string | undefined = initialUrl;
  while (nextUrl) {
    for (let attempt = 0; attempt <= MAX_GRAPH_RETRIES; attempt += 1) {
      const response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });
      if (response.status === 429 && attempt < MAX_GRAPH_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      if (!response.ok) throw new Error(`Microsoft Graph respondió con el estado ${response.status}.`);
      const page = await response.json() as GraphCollection<T>;
      values.push(...page.value);
      nextUrl = page['@odata.nextLink'];
      break;
    }
  }
  return values;
}

async function todoSnapshot(userId: string) {
  const accessToken = await graphAccessToken(userId);
  const lists = await graphCollection<GraphTodoList>(`${GRAPH_ROOT}/me/todo/lists`, accessToken);
  const taskCollections: Array<readonly [string, unknown[]]> = [];
  for (const list of lists) {
    taskCollections.push([
      list.id,
      await graphCollection<unknown>(
        `${GRAPH_ROOT}/me/todo/lists/${encodeURIComponent(list.id)}/tasks`,
        accessToken,
      ),
    ]);
  }
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
      if (error instanceof MicrosoftAuthorizationError) {
        return json({ error: { code: error.code, message: error.message } }, error.status);
      }
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
    if (error instanceof MicrosoftAuthorizationError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
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
