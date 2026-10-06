import { GOOGLE_CALENDAR_READ_SCOPES, GOOGLE_CALENDAR_WRITE_SCOPES } from './googleCalendar';
import { isSupabaseConfigured, supabase, supabaseRedirectUri } from '../supabase/supabaseClient';

const GOOGLE_CONNECTION_PENDING_KEY = 'mipanel.google.connectionPending';
let googleCredentialSync: Promise<void> | undefined;

function setPending(value: boolean) {
  try {
    if (value) window.sessionStorage.setItem(GOOGLE_CONNECTION_PENDING_KEY, 'true');
    else window.sessionStorage.removeItem(GOOGLE_CONNECTION_PENDING_KEY);
  } catch {
    // La redirección OAuth seguirá funcionando aunque el navegador bloquee sessionStorage.
  }
}

function pending() {
  try {
    return window.sessionStorage.getItem(GOOGLE_CONNECTION_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

async function saveGoogleRefreshToken(session: { access_token: string; provider_refresh_token?: string | null }) {
  if (!session.provider_refresh_token || !supabase) return;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-credentials`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.provider_refresh_token }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: { message?: unknown } } | undefined;
    throw new Error(typeof payload?.error?.message === 'string' ? payload.error.message : 'No se pudo guardar la conexión de Google.');
  }
  // El evento de Auth se comparte con Microsoft. Conservamos la marca hasta
  // que todos sus listeners hayan terminado para no tratar este token como Azure.
  window.setTimeout(() => setPending(false), 0);
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (pending() && session?.provider_refresh_token && !googleCredentialSync) {
      googleCredentialSync = saveGoogleRefreshToken(session);
      void googleCredentialSync.catch(() => undefined);
    }
  });
}

export async function waitForGoogleCredentialSync() {
  // getSession espera a procesar el callback OAuth. Antes de ese momento el
  // listener puede no haber creado aún googleCredentialSync.
  if (!supabase) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (pending() && !googleCredentialSync) {
    if (!data.session?.provider_refresh_token) {
      throw new Error('Google no devolvió la credencial de renovación. Vuelve a conectar Google para guardar la autorización.');
    }
    googleCredentialSync = saveGoogleRefreshToken(data.session);
  }
  if (googleCredentialSync) await googleCredentialSync;
}

export async function connectGoogleCalendar(withWrite = false) {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase no está configurado en esta compilación.');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error('Conecta primero Microsoft para vincular tu calendario de Google.');
  window.sessionStorage.removeItem('mipanel.microsoft.connectionPending');
  googleCredentialSync = undefined;
  setPending(true);
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: supabaseRedirectUri(),
      scopes: (withWrite ? GOOGLE_CALENDAR_WRITE_SCOPES : GOOGLE_CALENDAR_READ_SCOPES).join(' '),
      queryParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    },
  });
  if (error) {
    setPending(false);
    throw error;
  }
}

export async function googleSupabaseSession() {
  if (!supabase) return undefined;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function hasGoogleIdentity() {
  if (!supabase) return false;
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return Boolean(data.identities?.some((identity) => identity.provider === 'google'));
}

export async function disconnectGoogleCalendar() {
  if (!supabase) return;
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;
  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-credentials`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
  }).catch(() => undefined);
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  const identity = data.identities?.find((item) => item.provider === 'google');
  if (identity) {
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
    if (unlinkError) throw unlinkError;
  }
}
