import { isSupabaseConfigured, supabase, supabaseRedirectUri } from './supabaseClient';

let latestProviderToken: string | undefined;
let latestProviderRefreshToken: string | undefined;
let authReady: Promise<void> = Promise.resolve();
const SESSION_TIMEOUT_MS = 8_000;

async function syncMicrosoftRefreshToken(session: { access_token: string; provider_refresh_token?: string | null }) {
  const refreshToken = session.provider_refresh_token ?? latestProviderRefreshToken;
  if (!refreshToken || !supabase) return;

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/microsoft-credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw new Error('No se pudo guardar de forma segura la conexión de Microsoft.');
  latestProviderRefreshToken = undefined;
}

function withTimeout<T>(promise: Promise<T>, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), SESSION_TIMEOUT_MS)),
  ]);
}

if (supabase) {
  let resolveAuthReady: () => void = () => undefined;
  authReady = new Promise<void>((resolve) => {
    resolveAuthReady = resolve;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token) latestProviderToken = session.provider_token;
    if (session?.provider_refresh_token) {
      latestProviderRefreshToken = session.provider_refresh_token;
      void syncMicrosoftRefreshToken(session).catch(() => undefined);
    }
    resolveAuthReady();
  });
}

export async function connectSupabaseMicrosoft() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase no está configurado en esta compilación.');
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: supabaseRedirectUri(),
      scopes: 'openid profile email offline_access https://graph.microsoft.com/Tasks.ReadWrite',
    },
  });

  if (error) throw error;
}

export async function readSupabaseMicrosoftToken() {
  if (!supabase) return undefined;
  await Promise.race([
    authReady,
    new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
  ]);
  let { data, error } = await withTimeout(
    supabase.auth.getSession(),
    'Supabase tardó demasiado en restaurar la sesión.',
  );
  if (error) throw error;
  let session = data.session;
  let providerToken = session?.provider_token ?? latestProviderToken;
  if (session && !providerToken) {
    const refreshed = await withTimeout(
      supabase.auth.refreshSession(),
      'Supabase tardó demasiado en renovar la sesión.',
    );
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
    providerToken = session?.provider_token ?? latestProviderToken;
    data = { session };
  }
  if (session && !providerToken) {
    throw new Error('Supabase ha autenticado la cuenta, pero Azure no ha devuelto un token de Microsoft Graph. Revisa el permiso Tasks.ReadWrite y el alcance offline_access del proveedor Azure.');
  }
  if (!providerToken) return undefined;
  if (session?.provider_refresh_token || latestProviderRefreshToken) {
    // El vault se despliega por separado. Su indisponibilidad no debe impedir
    // el flujo directo estable de Microsoft Graph durante la transición.
    void syncMicrosoftRefreshToken(session!).catch(() => undefined);
  }
  return {
    accessToken: providerToken,
    expiresAt: Date.now() + 50 * 60 * 1000,
    supabaseAccessToken: session?.access_token,
  };
}

export async function disconnectSupabase() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/microsoft-credentials`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    }).catch(() => undefined);
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
