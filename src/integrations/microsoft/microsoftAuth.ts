import { MICROSOFT_SCOPES } from './microsoftGraph';

const SESSION_KEY = 'mipanel.microsoft.session';
const REDIRECT_PATH = 'microsoft';

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

function getClientId() {
  return import.meta.env.VITE_MICROSOFT_CLIENT_ID?.trim() ?? '';
}

function getTenant() {
  const tenant = import.meta.env.VITE_MICROSOFT_TENANT?.trim() || 'common';
  if (!/^[a-z0-9.-]+$/i.test(tenant)) {
    throw new Error('El tenant debe ser common, organizations, consumers, un dominio o un ID de directorio.');
  }
  return tenant;
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

export function isMicrosoftConfigured() {
  return Boolean(getClientId());
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

export async function connectMicrosoft(): Promise<MicrosoftTokenSession> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Microsoft no está configurado en esta compilación.');
  if (!identityApiAvailable()) {
    throw new Error('La conexión Microsoft solo está disponible desde la extensión instalada.');
  }

  const tenant = getTenant();
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
