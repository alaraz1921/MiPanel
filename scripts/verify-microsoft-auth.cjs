// Regresiones de autenticación con sesiones y respuestas OAuth ficticias.
// Ejecutar: node scripts/verify-microsoft-auth.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function load(relativePath, globals = {}, imports = {}) {
  const source = readFileSync(resolve(__dirname, '..', relativePath), 'utf8')
    .replaceAll('import.meta.env', 'testEnv');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(output, {
    module, exports: module.exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    },
    console, URL, URLSearchParams, Request, Response, AbortSignal, setTimeout, ...globals,
  });
  return module.exports;
}

function browserSession(session, pending = {}) {
  const storage = new Map(Object.entries(pending));
  const saves = [];
  let authListener;
  let releaseSave;
  const save = new Promise((resolveSave) => { releaseSave = resolveSave; });
  const api = load('src/integrations/supabase/supabaseAuth.ts', {
    testEnv: { VITE_SUPABASE_URL: 'https://example.test' },
    window: {
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      setTimeout: () => 1,
    },
    fetch: async (_url, options) => { saves.push(options); await save; return new Response(null, { status: 204 }); },
  }, {
    './supabaseClient': {
      isSupabaseConfigured: () => true,
      supabaseRedirectUri: () => 'https://example.test/',
      supabase: { auth: {
        onAuthStateChange: (listener) => { authListener = listener; },
        getSession: async () => ({ data: { session }, error: null }),
        refreshSession: () => { throw new Error('No debe pedir tokens Azure al renovar Supabase'); },
      } },
    },
  });
  authListener('INITIAL_SESSION', session);
  return { api, saves, storage, releaseSave };
}

const microsoftPending = 'mipanel.microsoft.connectionPending';
const googlePending = 'mipanel.google.connectionPending';

test('restaura sesión Supabase sin provider_token ni nuevo login', async () => {
  const { api, saves } = browserSession({ access_token: 'fake-session', expires_at: 123 });
  const session = await api.readSupabaseMicrosoftToken();
  assert.equal(session.supabaseAccessToken, 'fake-session');
  assert.equal(session.accessToken, '');
  assert.equal(saves.length, 0);
});

test('una sesión antigua no sobrescribe el refresh token rotado del vault', async () => {
  const { api, saves } = browserSession({ access_token: 'fake-session', provider_refresh_token: 'old-provider-token' });
  await api.readSupabaseMicrosoftToken();
  assert.equal(saves.length, 0);
});

test('un callback Google no escribe en el vault Microsoft', async () => {
  const { api, saves } = browserSession({ access_token: 'fake-session', provider_refresh_token: 'google-token' }, {
    [microsoftPending]: 'true', [googlePending]: 'true',
  });
  await api.readSupabaseMicrosoftToken();
  assert.equal(saves.length, 0);
});

test('callback Microsoft guarda una sola vez y espera a completar el vault', async () => {
  const { api, saves, releaseSave, storage } = browserSession({ access_token: 'fake-session', provider_refresh_token: 'new-microsoft-token' }, {
    [microsoftPending]: 'true',
  });
  let restored = false;
  const read = api.readSupabaseMicrosoftToken().then(() => { restored = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(restored, false);
  assert.equal(saves.length, 1);
  releaseSave();
  await read;
  assert.equal(storage.has(microsoftPending), false);
  await api.readSupabaseMicrosoftToken();
  assert.equal(saves.length, 1);
});

function tokenApi(fetch) {
  return load('supabase/functions/_shared/microsoftToken.ts', {
    Deno: { env: { get: (key) => ({ MICROSOFT_CLIENT_ID: 'fake-client', MICROSOFT_CLIENT_SECRET: 'fake-secret' })[key] } },
    fetch,
    setTimeout: (fn) => { queueMicrotask(fn); return 1; },
  });
}

test('rechazo permanente pide reconectar, sin reintentos ni datos sensibles', async () => {
  let requests = 0;
  const api = tokenApi(async () => {
    requests += 1;
    return Response.json({ error: 'invalid_grant', error_codes: [700082], error_description: 'sensitive-body' }, { status: 400 });
  });
  await assert.rejects(api.renewMicrosoftToken('fake-refresh'), (error) => {
    assert.equal(error.status, 401);
    assert.equal(error.code, 'MicrosoftReconnectRequired');
    assert.match(error.message, /AADSTS700082/);
    assert.doesNotMatch(error.message, /sensitive-body|fake-refresh/);
    return true;
  });
  assert.equal(requests, 1);
});

test('fallo temporal se reintenta y conserva el token nuevo de renovación', async () => {
  let requests = 0;
  const api = tokenApi(async () => ++requests === 1
    ? Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
    : Response.json({ access_token: 'new-access', refresh_token: 'rotated-refresh', expires_in: 3600 }));
  const result = await api.renewMicrosoftToken('fake-refresh');
  assert.equal(requests, 2);
  assert.equal(result.refreshToken, 'rotated-refresh');
});

test('secreto rechazado se diferencia de autorización de usuario caducada', async () => {
  const api = tokenApi(async () => Response.json({ error: 'invalid_client', error_codes: [7000222] }, { status: 401 }));
  await assert.rejects(api.renewMicrosoftToken('fake-refresh'), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.code, 'MicrosoftConfiguration');
    return true;
  });
});

test('el vault rechaza un token ajeno sin sobrescribir la credencial existente', async () => {
  let handler;
  let writes = 0;
  const token = tokenApi(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
  load('supabase/functions/microsoft-credentials/index.ts', {
    Deno: { serve: (callback) => { handler = callback; } },
  }, {
    '../_shared/supabaseAuth.ts': {
      authenticatedUser: async () => ({ id: 'fake-user' }),
      corsHeaders: {},
      json: (body, status = 200) => Response.json(body, { status }),
      serviceClient: () => ({ from: () => ({ upsert: () => { writes += 1; return { error: null }; } }) }),
    },
    '../_shared/credentialCipher.ts': { encryptCredential: async () => 'encrypted-fake-token' },
    '../_shared/microsoftToken.ts': token,
  });
  const response = await handler(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer fake-session', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: 'fake-google-refresh-token' }),
  }));
  assert.equal(response.status, 401);
  assert.equal(writes, 0);
});

test('peticiones concurrentes comparten renovación y no sobrescriben un login posterior', async () => {
  let handler;
  let renewals = 0;
  const filters = [];
  const token = tokenApi(async () => {
    renewals += 1;
    return Response.json({ access_token: 'fake-graph-token', refresh_token: 'new-refresh' });
  });
  const client = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { refresh_token_ciphertext: 'old-encrypted-token' }, error: null,
    }) }) }),
    update: () => ({ eq: (field, value) => {
      filters.push([field, value]);
      return { eq: (lastField, lastValue) => {
        filters.push([lastField, lastValue]);
        return Promise.resolve({ error: null });
      } };
    } }),
  }) };
  load('supabase/functions/microsoft-graph/index.ts', {
    Deno: { serve: (callback) => { handler = callback; } },
    fetch: async () => Response.json({ value: [] }),
  }, {
    '../_shared/supabaseAuth.ts': {
      authenticatedUser: async () => ({ id: 'fake-user' }), corsHeaders: {},
      json: (body, status = 200) => Response.json(body, { status }), serviceClient: () => client,
    },
    '../_shared/credentialCipher.ts': {
      encryptCredential: async () => 'new-encrypted-token', decryptCredential: async () => 'fake-refresh',
    },
    '../_shared/microsoftToken.ts': token,
  });
  const request = () => new Request('https://example.test?path=/me/todo/snapshot', {
    headers: { Authorization: 'Bearer fake-session' },
  });
  const responses = await Promise.all([handler(request()), handler(request())]);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[1].status, 200);
  assert.equal(renewals, 1);
  assert.deepEqual(filters, [['user_id', 'fake-user'], ['refresh_token_ciphertext', 'old-encrypted-token']]);
});

test('borrar una tarea conserva el 204 de Graph sin convertirlo en error del backend', async () => {
  let handler;
  let method;
  const token = tokenApi(async () => Response.json({ access_token: 'fake-graph-token' }));
  load('supabase/functions/microsoft-graph/index.ts', {
    Deno: { serve: (callback) => { handler = callback; } },
    fetch: async (_url, options) => {
      method = options.method;
      return new Response(null, { status: 204 });
    },
  }, {
    '../_shared/supabaseAuth.ts': {
      authenticatedUser: async () => ({ id: 'fake-user' }), corsHeaders: {},
      json: (body, status = 200) => Response.json(body, { status }),
      serviceClient: () => ({ from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { refresh_token_ciphertext: 'fake-encrypted-token' }, error: null,
        }) }) }),
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      }) }),
    },
    '../_shared/credentialCipher.ts': {
      decryptCredential: async () => 'fake-refresh', encryptCredential: async () => 'fake-encrypted-token',
    },
    '../_shared/microsoftToken.ts': token,
  });
  const response = await handler(new Request('https://example.test?path=/me/todo/lists/list/tasks/task', {
    method: 'DELETE', headers: { Authorization: 'Bearer fake-session' },
  }));
  assert.equal(method, 'DELETE');
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
});

test('el cliente acepta borrados correctos sin contenido sin intentar leer JSON', async () => {
  for (const status of [200, 204, 205]) {
    const graph = load('src/integrations/microsoft/microsoftGraph.ts', {
      testEnv: { VITE_SUPABASE_URL: 'https://example.test' },
      AbortController,
      window: { setTimeout, clearTimeout },
      fetch: async (_url, options) => {
        assert.equal(options.method, 'DELETE');
        return new Response(null, { status });
      },
    });
    await graph.deleteMicrosoftTodoTask({ accessToken: '', supabaseAccessToken: 'fake-session' }, {
      id: 'task', listId: 'list',
    });
  }
});
