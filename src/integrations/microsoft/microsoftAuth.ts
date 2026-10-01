import { MICROSOFT_SCOPES } from './microsoftGraph';

const SESSION_KEY = 'mipanel.microsoft.session';
const CONFIG_KEY = 'mipanel.microsoft.config';
const REDIRECT_PATH = 'microsoft';

export type MicrosoftPublicConfig = {
  clientId: string;
  tenant: string;
};

export type MicrosoftTokenSession = {
  accessToken: string;
  expiresAt: number;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function normalizeConfig(config: MicrosoftPublicConfig): MicrosoftPublicConfig {
  return {
    clientId: config.clientId.trim(),
    tenant: config.tenant.trim() || 'common',
  };
}

function validateConfig(config: MicrosoftPublicConfig) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.clientId)) {
    throw new Error('El Client ID debe ser un identificador UUID válido de Microsoft Entra.');
  }
  if (!/^[a-z0-9.-]+$/i.test(config.tenant)) {
    throw new Error('El tenant debe ser common, organizations, consumers, un dominio o un ID de directorio.');
  }
}

function identityApiAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.identity?.launchWebAuthFlow);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(byteLength: number) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function createPkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

export async function readMicrosoftConfig(): Promise<MicrosoftPublicConfig | undefined> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(CONFIG_KEY);
    const stored = result[CONFIG_KEY] as MicrosoftPublicConfig | undefined;
    if (stored?.clientId) {
      const config = normalizeConfig(stored);
      validateConfig(config);
      return config;
    }
  }

  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) return undefined;
  const config = normalizeConfig({
    clientId,
    tenant: import.meta.env.VITE_MICROSOFT_TENANT?.trim() || 'common',
  });
  validateConfig(config);
  return config;
}

export async function saveMicrosoftConfig(input: MicrosoftPublicConfig) {
  const config = normalizeConfig(input);
  validateConfig(config);
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    throw new Error('La configuración Microsoft solo puede guardarse desde la extensión instalada.');
  }
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
  return config;
}

export async function removeMicrosoftConfig() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.remove(CONFIG_KEY);
  }
}

export function getMicrosoftRedirectUri() {
  return identityApiAvailable() ? chrome.identity.getRedirectURL(REDIRECT_PATH) : undefined;
}

export async function readMicrosoftSession(): Promise<MicrosoftTokenSession | undefined> {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) return undefined;
  const result = await chrome.storage.session.get(SESSION_KEY);
  const session = result[SESSION_KEY] as MicrosoftTokenSession | undefined;
  if (!session || session.expiresAt <= Date.now() + 60_000) {
    await chrome.storage.session.remove(SESSION_KEY);
    return undefined;
  }
  return session;
}

export async function clearMicrosoftSession() {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    await chrome.storage.session.remove(SESSION_KEY);
  }
}

export async function connectMicrosoft(config: MicrosoftPublicConfig): Promise<MicrosoftTokenSession> {
  const normalizedConfig = normalizeConfig(config);
  validateConfig(normalizedConfig);
  if (!identityApiAvailable()) {
    throw new Error('La conexión Microsoft solo está disponible desde la extensión instalada.');
  }

  const { clientId, tenant } = normalizedConfig;
  const redirectUri = chrome.identity.getRedirectURL(REDIRECT_PATH);
  const verifier = randomBase64Url(64);
  const challenge = await createPkceChallenge(verifier);
  const state = randomBase64Url(32);
  const scopes = MICROSOFT_SCOPES.map((scope) => `https://graph.microsoft.com/${scope}`).join(' ');

  const authorizeUrl = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authorizeUrl.toString(),
    interactive: true,
  });

  if (!responseUrl) throw new Error('Microsoft no devolvió una respuesta de autenticación.');
  const response = new URL(responseUrl);
  const errorDescription = response.searchParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);
  if (response.searchParams.get('state') !== state) {
    throw new Error('La respuesta de Microsoft no superó la validación de estado.');
  }

  const code = response.searchParams.get('code');
  if (!code) throw new Error('Microsoft no devolvió el código de autorización.');

  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: scopes,
      }),
    },
  );

  const token = await tokenResponse.json() as TokenResponse;
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || 'No se pudo obtener el token de Microsoft.');
  }

  const session: MicrosoftTokenSession = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(token.expires_in ?? 3600, 60) * 1000,
  };
  await chrome.storage.session.set({ [SESSION_KEY]: session });
  return session;
}
