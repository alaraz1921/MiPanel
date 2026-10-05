import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-microsoft-access-token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const TODO_PATH = /^\/me\/todo\/lists(?:\/[^/]+\/tasks(?:\/[^/]+)?)?$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return json({ error: 'Método no permitido.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  const microsoftToken = request.headers.get('x-microsoft-access-token');
  if (!authorization?.startsWith('Bearer ') || !microsoftToken) {
    return json({ error: 'Faltan las credenciales de MiPanel o Microsoft.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Backend sin configurar.' }, 500);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: 'Sesión de MiPanel no válida.' }, 401);

  const input = new URL(request.url);
  const path = input.searchParams.get('path') ?? '';
  if (!TODO_PATH.test(path)) return json({ error: 'Ruta de Microsoft To Do no permitida.' }, 403);

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'DELETE') body = await request.text();

  const graphResponse = await fetch(`${GRAPH_ROOT}${path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${microsoftToken}`,
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
});
