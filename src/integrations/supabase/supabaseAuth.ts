import { isSupabaseConfigured, supabase, supabaseRedirectUri } from './supabaseClient';

let credentialSync: Promise<void> | undefined;
let authReady: Promise<void> = Promise.resolve();
const SESSION_TIMEOUT_MS = 8_000;
const GOOGLE_CONNECTION_PENDING_KEY = 'mipanel.google.connectionPending';
const MICROSOFT_CONNECTION_PENDING_KEY = 'mipanel.microsoft.connectionPending';

function isMicrosoftConnectionPending() {
  try {
    return window.sessionStorage.getItem(MICROSOFT_CONNECTION_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

function isGoogleConnectionPending() {
  try {
    return window.sessionStorage.getItem(GOOGLE_CONNECTION_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

async function syncMicrosoftRefreshToken(session: { access_token: string; provider_refresh_token?: string | null }) {
  const refreshToken = session.provider_refresh_token;
  // Solo una conexión Azure iniciada en esta pestaña puede sustituir el vault.
  // Una sesión restaurada puede conservar tokens antiguos o del Google vinculado.
  if (!refreshToken || !supabase || !isMicrosoftConnectionPending() || isGoogleConnectionPending()) return;
  if (credentialSync) return credentialSync;

  credentialSync = saveMicrosoftCredential(session.access_token, refreshToken);
  try {
    await credentialSync;
  } finally {
    credentialSync = undefined;
  }
}

async function saveMicrosoftCredential(accessToken: string, refreshToken: string) {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/microsoft-credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
    signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: { message?: unknown } } | undefined;
    const message = payload?.error?.message;
    throw new Error(typeof message === 'string' ? message : 'No se pudo guardar de forma segura la conexión de Microsoft.');
  }
  window.sessionStorage.removeItem(MICROSOFT_CONNECTION_PENDING_KEY);
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
    if (session?.provider_refresh_token) void syncMicrosoftRefreshToken(session).catch(() => undefined);
    resolveAuthReady();
  });
}

export async function connectSupabaseMicrosoft() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase no está configurado en esta compilación.');
  }

  window.sessionStorage.removeItem(GOOGLE_CONNECTION_PENDING_KEY);
  window.sessionStorage.setItem(MICROSOFT_CONNECTION_PENDING_KEY, 'true');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: supabaseRedirectUri(),
      scopes: 'openid profile email offline_access https://graph.microsoft.com/Tasks.ReadWrite',
    },
  });

  if (error) {
    window.sessionStorage.removeItem(MICROSOFT_CONNECTION_PENDING_KEY);
    throw error;
  }
}

export async function readSupabaseMicrosoftToken() {
  if (!supabase) return undefined;
  await Promise.race([
    authReady,
    new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
  ]);
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    'Supabase tardó demasiado en restaurar la sesión.',
  );
  if (error) throw error;
  const session = data.session;
  if (!session) return undefined;
  if (credentialSync) await credentialSync;
  if (isMicrosoftConnectionPending() && !isGoogleConnectionPending()) {
    if (!session.provider_refresh_token) {
      throw new Error('Microsoft no devolvió autorización para renovar la conexión. Vuelve a conectar y acepta el permiso solicitado.');
    }
    await syncMicrosoftRefreshToken(session);
  }
  // Supabase renueva su propia sesión, no los tokens del proveedor. Graph se
  // autoriza exclusivamente en el servidor usando las credenciales del vault.
  return {
    accessToken: '',
    expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 50 * 60 * 1000,
    supabaseAccessToken: session.access_token,
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
  window.sessionStorage.removeItem(MICROSOFT_CONNECTION_PENDING_KEY);
}
