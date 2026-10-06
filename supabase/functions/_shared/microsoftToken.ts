export class MicrosoftAuthorizationError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
  }
}

type TokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_codes?: unknown;
};

export async function renewMicrosoftToken(refreshToken: string) {
  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID');
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET');
  const tenant = Deno.env.get('MICROSOFT_TENANT') ?? 'common';
  if (!clientId || !clientSecret) {
    throw new MicrosoftAuthorizationError('La integración Microsoft no está terminada de configurar.', 503, 'MicrosoftConfiguration');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: 'offline_access https://graph.microsoft.com/Tasks.ReadWrite',
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      if (attempt === 0) continue;
      throw new MicrosoftAuthorizationError('Microsoft no responde temporalmente al renovar la conexión. Intenta actualizar dentro de unos segundos.', 503, 'MicrosoftUnavailable');
    }
    const payload = await response.json().catch(() => ({})) as TokenPayload;
    if (response.ok && typeof payload.access_token === 'string') {
      return {
        accessToken: payload.access_token,
        refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : refreshToken,
        expiresIn: typeof payload.expires_in === 'number' && payload.expires_in > 0 ? payload.expires_in : 300,
      };
    }

    const transient = response.status === 429 || response.status >= 500
      || payload.error === 'temporarily_unavailable' || payload.error === 'server_error';
    if (transient) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw new MicrosoftAuthorizationError('Microsoft no puede renovar la conexión temporalmente. Intenta actualizar dentro de unos segundos.', 503, 'MicrosoftUnavailable');
    }
    // Solo códigos conocidos y numéricos; nunca devolver el cuerpo OAuth ni tokens.
    const codes = Array.isArray(payload.error_codes)
      ? payload.error_codes.filter((code): code is number => Number.isSafeInteger(code))
      : [];
    const diagnostic = codes.length ? ` (AADSTS${codes[0]})` : '';
    if (payload.error === 'invalid_grant' || payload.error === 'interaction_required') {
      throw new MicrosoftAuthorizationError(`Microsoft ha rechazado la autorización guardada${diagnostic}. Vuelve a conectar Microsoft.`, 401, 'MicrosoftReconnectRequired');
    }
    if (payload.error === 'invalid_client' || payload.error === 'unauthorized_client') {
      throw new MicrosoftAuthorizationError(`Microsoft ha rechazado la configuración de la aplicación${diagnostic}. Revisa el secreto y el Client ID del backend.`, 503, 'MicrosoftConfiguration');
    }
    if (payload.error === 'invalid_scope') {
      throw new MicrosoftAuthorizationError(`Microsoft ha rechazado los permisos de la aplicación${diagnostic}. Revisa Tasks.ReadWrite y offline_access.`, 503, 'MicrosoftConfiguration');
    }
    throw new MicrosoftAuthorizationError(`Microsoft no pudo renovar la autorización${diagnostic}.`, 502, 'MicrosoftRenewalFailed');
  }
  throw new MicrosoftAuthorizationError('Microsoft no está disponible temporalmente.', 503, 'MicrosoftUnavailable');
}
