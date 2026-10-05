import { authenticatedUser, corsHeaders, json, serviceClient } from '../_shared/supabaseAuth.ts';
import { decryptCredential, encryptCredential } from '../_shared/credentialCipher.ts';

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const TODO_PATH = /^\/me\/todo\/lists(?:\/[^/]+\/tasks(?:\/[^/]+)?)?$/;

async function graphAccessToken(userId: string) {
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
  const payload = await response.json() as { access_token?: unknown; refresh_token?: unknown };
  if (!response.ok || typeof payload.access_token !== 'string') throw new Error('Microsoft no pudo renovar la autorización.');

  if (typeof payload.refresh_token === 'string') {
    const { error: updateError } = await supabase.from('microsoft_credentials').upsert({
      user_id: userId,
      refresh_token_ciphertext: await encryptCredential(payload.refresh_token),
    });
    if (updateError) throw updateError;
  }
  return payload.access_token;
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
    console.error('No se pudo completar la llamada a Microsoft Graph.', error instanceof Error ? error.message : 'Error desconocido');
    return json({ error: error instanceof Error ? error.message : 'Microsoft Graph no está disponible.' }, 502);
  }
});
