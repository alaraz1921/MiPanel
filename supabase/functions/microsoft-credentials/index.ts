import { authenticatedUser, corsHeaders, json, serviceClient } from '../_shared/supabaseAuth.ts';
import { encryptCredential } from '../_shared/credentialCipher.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'Método no permitido.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Falta la sesión de MiPanel.' }, 401);

  try {
    const user = await authenticatedUser(authorization);
    const supabase = serviceClient();

    if (request.method === 'DELETE') {
      const { error } = await supabase.from('microsoft_credentials').delete().eq('user_id', user.id);
      if (error) throw error;
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const body = await request.json() as { refreshToken?: unknown };
    if (typeof body.refreshToken !== 'string' || body.refreshToken.length < 20) {
      return json({ error: 'La credencial de Microsoft no es válida.' }, 400);
    }
    const { error } = await supabase.from('microsoft_credentials').upsert({
      user_id: user.id,
      refresh_token_ciphertext: await encryptCredential(body.refreshToken),
    });
    if (error) throw error;
    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Error desconocido';
    console.error('No se pudo actualizar la credencial de Microsoft.', detail);
    const safeMessage = [
      'Backend sin configurar.',
      'Falta la clave de cifrado de credenciales.',
      'La clave de cifrado debe tener 32 bytes en Base64.',
    ].includes(detail)
      ? detail
      : detail.includes('microsoft_credentials')
        ? 'Falta aplicar la migración de credenciales de Microsoft en Supabase.'
        : `El vault de Microsoft no está disponible: ${detail}`;
    return json({ error: { code: 'MiPanelVault', message: safeMessage } }, 500);
  }
});
