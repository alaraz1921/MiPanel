import {
  BrowserCacheLocation,
  PublicClientApplication,
} from '@azure/msal-browser';
import { MICROSOFT_SCOPES } from './microsoftGraph';

export type MicrosoftTokenSession = {
  accessToken: string;
  expiresAt: number;
  grantedScopes?: string[];
};

let clientPromise: Promise<PublicClientApplication> | undefined;
const ACCOUNT_HINT_KEY = 'mipanel.microsoft.accountHint';
const RESTORE_ATTEMPT_KEY = 'mipanel.microsoft.restoreAttempted';

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

function getRedirectUri() {
  const configured = import.meta.env.VITE_MICROSOFT_REDIRECT_URI?.trim();
  if (!configured) {
    // La página de retorno mínima transmite de forma segura la respuesta del
    // popup a la pestaña principal mediante el redirect bridge de MSAL.
    return new URL(`${import.meta.env.BASE_URL}microsoft-auth-redirect.html`, window.location.origin).toString();
  }

  try {
    const redirect = new URL(configured);
    if (!['http:', 'https:'].includes(redirect.protocol)) throw new Error();
    return redirect.toString();
  } catch {
    throw new Error('VITE_MICROSOFT_REDIRECT_URI debe ser una URL HTTP o HTTPS válida.');
  }
}

function getApplicationRedirectUri() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

function graphScopes() {
  return MICROSOFT_SCOPES.map((scope) => `https://graph.microsoft.com/${scope}`);
}

function readAccountHint() {
  try {
    return window.localStorage.getItem(ACCOUNT_HINT_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function rememberAccount(username: string) {
  if (!username) return;
  try {
    window.localStorage.setItem(ACCOUNT_HINT_KEY, username);
  } catch {
    // La aplicación puede seguir funcionando aunque el navegador bloquee el almacenamiento local.
  }
}

function clearAccountHint() {
  try {
    window.localStorage.removeItem(ACCOUNT_HINT_KEY);
  } catch {
    // No hay nada más que hacer si el navegador ya ha descartado el almacenamiento.
  }
}

function restoreWasAttempted() {
  try {
    return window.sessionStorage.getItem(RESTORE_ATTEMPT_KEY) === 'true';
  } catch {
    return false;
  }
}

function markRestoreAttempt() {
  try {
    window.sessionStorage.setItem(RESTORE_ATTEMPT_KEY, 'true');
  } catch {
    // Si no existe sessionStorage, el flujo de Microsoft sigue determinando el resultado.
  }
}

function clearRestoreAttempt() {
  try {
    window.sessionStorage.removeItem(RESTORE_ATTEMPT_KEY);
  } catch {
    // No hay estado efímero que limpiar.
  }
}

async function microsoftClient() {
  if (!clientPromise) {
    const client = new PublicClientApplication({
      auth: {
        clientId: getClientId(),
        authority: `https://login.microsoftonline.com/${getTenant()}`,
        redirectUri: getRedirectUri(),
      },
      cache: {
        // MSAL renueva la sesión entre aperturas sin que MiPanel escriba
        // ni manipule tokens directamente.
        cacheLocation: BrowserCacheLocation.LocalStorage,
      },
    });
    clientPromise = (async () => {
      await client.initialize();
      try {
        const result = await client.handleRedirectPromise();
        if (result?.account) {
          client.setActiveAccount(result.account);
          rememberAccount(result.account.username);
          clearRestoreAttempt();
        }
      } catch {
        // Una restauración sin sesión de Microsoft debe volver al estado desconectado.
      }
      return client;
    })();
  }
  return clientPromise;
}

async function currentAccount(client: PublicClientApplication) {
  const active = client.getActiveAccount();
  if (active) {
    rememberAccount(active.username);
    return active;
  }
  const account = client.getAllAccounts()[0];
  if (account) {
    client.setActiveAccount(account);
    rememberAccount(account.username);
  }
  return account;
}

function sessionFromToken(accessToken: string, expiresOn: Date | null, scopes: string[]) {
  return {
    accessToken,
    expiresAt: expiresOn?.getTime() ?? Date.now() + 55 * 60 * 1000,
    grantedScopes: scopes,
  } satisfies MicrosoftTokenSession;
}

export function isMicrosoftConfigured() {
  return Boolean(getClientId());
}

export async function readMicrosoftSession(): Promise<MicrosoftTokenSession | undefined> {
  if (!isMicrosoftConfigured()) return undefined;

  try {
    const client = await microsoftClient();
    const account = await currentAccount(client);
    const result = account
      ? await client.acquireTokenSilent({
        account,
        scopes: graphScopes(),
        redirectUri: getRedirectUri(),
      })
      : await restoreMicrosoftSession(client);
    if (!result) return undefined;
    if (result.account) {
      client.setActiveAccount(result.account);
      rememberAccount(result.account.username);
    }
    return sessionFromToken(result.accessToken, result.expiresOn, result.scopes);
  } catch {
    return undefined;
  }
}

export async function clearMicrosoftSession() {
  if (!isMicrosoftConfigured()) return;
  const client = await microsoftClient();
  client.setActiveAccount(null);
  await client.clearCache();
  clearAccountHint();
  clearRestoreAttempt();
}

async function restoreMicrosoftSession(client: PublicClientApplication) {
  const loginHint = readAccountHint();
  if (!loginHint || restoreWasAttempted()) return undefined;
  markRestoreAttempt();
  await client.loginRedirect({
    loginHint,
    prompt: 'none',
    scopes: graphScopes(),
    redirectUri: getApplicationRedirectUri(),
  });
  return undefined;
}

export async function connectMicrosoft(): Promise<MicrosoftTokenSession> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Microsoft no está configurado en esta compilación.');

  const client = await microsoftClient();
  const login = await client.loginPopup({
    scopes: graphScopes(),
    redirectUri: getRedirectUri(),
    prompt: 'select_account',
  });
  const account = login.account ?? await currentAccount(client);
  if (!account) throw new Error('Microsoft no devolvió una cuenta autenticada.');

  client.setActiveAccount(account);
  rememberAccount(account.username);
  const token = await client.acquireTokenSilent({
    account,
    scopes: graphScopes(),
    redirectUri: getRedirectUri(),
  });
  return sessionFromToken(token.accessToken, token.expiresOn, token.scopes);
}
