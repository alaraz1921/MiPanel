import { isSupabaseConfigured, supabase, supabaseRedirectUri } from './supabaseClient';

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
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const providerToken = data.session?.provider_token;
  if (!providerToken) return undefined;
  return {
    accessToken: providerToken,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
}

export async function disconnectSupabase() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
