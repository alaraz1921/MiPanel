import { isSupabaseConfigured, supabase, supabaseRedirectUri } from './supabaseClient';

let latestProviderToken: string | undefined;
let authReady: Promise<void> = Promise.resolve();

if (supabase) {
  let resolveAuthReady: () => void = () => undefined;
  authReady = new Promise<void>((resolve) => {
    resolveAuthReady = resolve;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.provider_token) latestProviderToken = session.provider_token;
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
  let { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  let session = data.session;
  let providerToken = session?.provider_token ?? latestProviderToken;
  if (session && !providerToken) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
    providerToken = session?.provider_token ?? latestProviderToken;
    data = { session };
  }
  if (session && !providerToken) {
    throw new Error('Supabase ha autenticado la cuenta, pero Azure no ha devuelto un token de Microsoft Graph. Revisa el permiso Tasks.ReadWrite y el alcance offline_access del proveedor Azure.');
  }
  if (!providerToken) return undefined;
  return {
    accessToken: providerToken,
    expiresAt: Date.now() + 50 * 60 * 1000,
    supabaseAccessToken: session?.access_token,
  };
}

export async function disconnectSupabase() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
