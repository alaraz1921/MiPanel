// Ejecutar: node scripts/verify-calendar.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(path, imports = {}, globals = {}) {
  const source = readFileSync(resolve(__dirname, '..', path), 'utf8').replaceAll('import.meta.env', 'testEnv');
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  runInNewContext(output, { module, exports: module.exports, Request, Response, URL, URLSearchParams, AbortSignal, ...globals, require: (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name in imports) return imports[name];
    throw new Error(`Unexpected import: ${name}`);
  } });
  return module.exports;
}

const dayApi = load('src/features/calendar/dayEntries.ts');
const dateApi = load('src/lib/date.ts');
const { CalendarDayDialog } = load('src/features/calendar/CalendarDayDialog.tsx', {
  '../../lib/date': dateApi,
  '../../assets/edit-task.png': { default: 'edit-task.png' },
  '../../assets/delete-task.png': { default: 'delete-task.png' },
});
const date = dateApi.toDateKey(new Date());
const entries = [
  { id: 'late', date, title: 'Evento tarde', time: '18:30', kind: 'event', source: 'google-calendar', calendarName: 'Trabajo', color: '#123456' },
  { id: 'due', date, title: 'Tarea sin hora', kind: 'due', source: 'microsoft-todo' },
  { id: 'early', date, title: 'Aviso temprano', time: '08:00', kind: 'reminder', source: 'microsoft-todo' },
  { id: 'other', date: '2000-01-01', title: 'Otro día', kind: 'event', source: 'google-calendar' },
];

test('filtra el día y ordena sin hora primero, después por hora, sin modificar el original', () => {
  const original = entries.map((entry) => entry.id);
  assert.deepEqual(Array.from(dayApi.entriesForDay(entries, date), (entry) => entry.id), ['due', 'early', 'late']);
  assert.deepEqual(entries.map((entry) => entry.id), original);
});

test('el modal muestra todos los elementos, títulos completos, horas y calendarios', () => {
  const html = renderToStaticMarkup(React.createElement(CalendarDayDialog, {
    date, entries: dayApi.entriesForDay(entries, date), onClose: () => {},
  }));
  assert.match(html, /aria-labelledby="calendar-day-dialog-title"/);
  assert.ok(html.indexOf('Tarea sin hora') < html.indexOf('Aviso temprano'));
  assert.ok(html.indexOf('Aviso temprano') < html.indexOf('Evento tarde'));
  assert.match(html, /08:00/);
  assert.match(html, /Evento · Trabajo/);
  assert.match(html, /border-color:#123456/);
  assert.doesNotMatch(html, /Otro día/);
});

test('cualquier día ofrece el modal y solo señala elementos ocultos si supera tres', () => {
  const google = { events: [], status: 'disconnected', visibleCalendarIds: [], calendars: [] };
  const { CalendarView } = load('src/features/calendar/CalendarView.tsx', {
    '../../integrations/google/GoogleCalendarContext': { useGoogleCalendar: () => google },
    '../../integrations/microsoft/MicrosoftTodoContext': { useMicrosoftTodo: () => ({ status: 'disconnected', tasks: [], updatingTaskIds: [] }) },
    '../../lib/date': dateApi,
    './CalendarDayDialog': { CalendarDayDialog },
    './dayEntries': dayApi,
    '../../components/ConfirmDialog': { ConfirmDialog: () => null },
    '../tasks/TaskEditorDialog': { TaskEditorDialog: () => null },
    './EventEditorDialog': { EventEditorDialog: () => null },
  });
  for (const count of [0, 3, 4, 8]) {
    google.events = Array.from({ length: count }, (_, index) => ({ ...entries[0], id: String(index) }));
    const html = renderToStaticMarkup(React.createElement(CalendarView));
    assert.equal((html.match(/aria-haspopup="dialog"/g) ?? []).length, 42);
    assert.match(html, new RegExp(`Ver los ${count} elementos`));
    assert.equal(html.includes('calendar-day-more'), count > 3);
    assert.doesNotMatch(html, /Google conectado|Desconectar Google|Conectar Google/);
  }
});

test('la agenda ofrece editar y eliminar solo en elementos editables', () => {
  const html = renderToStaticMarkup(React.createElement(CalendarDayDialog, {
    date, entries: [{ ...entries[0], canEdit: true }, { ...entries[1], canEdit: false }],
    onClose: () => {}, onEdit: () => {}, onDelete: () => {},
  }));
  assert.equal((html.match(/aria-label="Editar /g) ?? []).length, 1);
  assert.equal((html.match(/aria-label="Eliminar /g) ?? []).length, 1);
  assert.match(html, /src="edit-task.png" alt=""/);
  assert.match(html, /src="delete-task.png" alt=""/);
  assert.equal((html.match(/task-icon-button/g) ?? []).length, 2);
  assert.match(html, /calendar-agenda-title-row"><span class="calendar-agenda-title">Evento tarde<\/span><div class="calendar-agenda-actions">/);
  assert.doesNotMatch(html, />Conectado</);
  const reading = renderToStaticMarkup(React.createElement(CalendarDayDialog, {
    date, entries: [{ ...entries[0], canEdit: true }],
    onClose: () => {}, onEdit: () => {}, onDelete: () => {}, onAuthorizeGoogle: () => {},
  }));
  assert.match(reading, /Autorizar edición/);
  assert.equal((reading.match(/disabled=""/g) ?? []).length, 2);
});

test('completar tareas no usa un label envolvente ni confirmación y solo el título y check son activadores', () => {
  const { TaskPanel } = load('src/features/tasks/TaskPanel.tsx', {
    '../../assets/edit-task.png': { default: 'edit-task.png' },
    '../../assets/delete-task.png': { default: 'delete-task.png' },
    '../../components/ConfirmDialog': { ConfirmDialog: () => null },
    '../../hooks/useLocalStorage': { useLocalStorage: () => ['list', () => {}] },
    '../../integrations/microsoft/MicrosoftTodoContext': { useMicrosoftTodo: () => ({
      status: 'connected', tasks: [{ id: 'task', listId: 'list', listName: 'Trabajo', title: 'Tarea', completed: false, source: 'microsoft-todo' }],
      lists: [{ id: 'list', name: 'Trabajo' }], updatingTaskIds: [],
    }) },
    '../../lib/date': dateApi, './TaskEditorDialog': { TaskEditorDialog: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(TaskPanel));
  assert.match(html, /<div class="task-check"><input type="checkbox"/);
  assert.match(html, /<button[^>]*task-title-toggle[^>]*>Tarea<\/button>/);
  assert.doesNotMatch(html, /<label class="task-check"|<dialog/);
  assert.match(html, /aria-label="Editar Tarea"/);
  assert.match(html, /aria-label="Eliminar Tarea"/);
  assert.match(html, /src="edit-task.png" alt=""/);
  assert.match(html, /src="delete-task.png" alt=""/);
  assert.equal((html.match(/task-icon-button/g) ?? []).length, 2);
});

const googleClient = load('src/integrations/google/googleCalendar.ts', {}, { testEnv: {} });
test('eventos de día completo convierten el fin incluido a exclusivo y validan horas', () => {
  const patch = googleClient.eventPatch({ title: 'Evento', date: '2026-10-06', endDate: '2026-10-07' });
  assert.equal(patch.end.date, '2026-10-08');
  assert.equal(patch.start.dateTime, null);
  assert.throws(() => googleClient.eventPatch({ title: 'Evento', date: '2026-10-06', endDate: '2026-10-06', time: '12:00', endTime: '11:00' }));
});

test('normaliza referencias originales, fin de día completo y permisos por calendario', async () => {
  const client = load('src/integrations/google/googleCalendar.ts', {}, {
    testEnv: { VITE_SUPABASE_URL: 'https://example.test' },
    fetch: async () => Response.json({
      canWriteEvents: true,
      calendars: [{ id: 'owner', accessRole: 'owner' }, { id: 'reader', accessRole: 'reader' }],
      eventsByCalendar: {
        owner: [{ id: 'original', etag: '"v1"', summary: 'Evento', start: { date: '2026-10-06' }, end: { date: '2026-10-08' } }],
        reader: [{ id: 'original', summary: 'Lectura', start: { date: '2026-10-06' } }],
      },
    }),
  });
  const snapshot = await client.fetchGoogleCalendarSnapshot('fake-session', new Date(), new Date(), []);
  assert.equal(snapshot.canWriteEvents, true);
  assert.equal(snapshot.events[0].sourceId, 'original');
  assert.equal(snapshot.events[0].sourceContainerId, 'owner');
  assert.equal(snapshot.events[0].endDate, '2026-10-07');
  assert.equal(snapshot.events[0].canEdit, true);
  assert.equal(snapshot.events[1].canEdit, false);
});

test('Google solicita escritura únicamente al autorizar edición', async () => {
  const requests = [];
  const api = load('src/integrations/google/googleAuth.ts', {
    './googleCalendar': googleClient,
    '../supabase/supabaseClient': {
      isSupabaseConfigured: () => true, supabaseRedirectUri: () => 'https://example.test/',
      supabase: { auth: {
        onAuthStateChange: () => {},
        getSession: async () => ({ data: { session: { access_token: 'fake-session', user: { id: 'fake-user' } } } }),
        getUserIdentities: async () => ({ data: { identities: [] } }),
        linkIdentity: async (request) => { requests.push(request); return {}; },
      } },
    },
  }, { window: { sessionStorage: { setItem: () => {}, removeItem: () => {}, getItem: () => null } } });
  await api.connectGoogleCalendar();
  await api.connectGoogleCalendar(true);
  assert.match(requests[0].options.scopes, /calendar.events.readonly/);
  assert.doesNotMatch(requests[1].options.scopes, /events.readonly/);
  assert.match(requests[1].options.scopes, /calendar.events /);
  assert.match(requests[1].options.scopes, /calendar.calendarlist.readonly/);
  assert.doesNotMatch(requests[1].options.scopes, /tasks/);
});

function backend({ role = 'owner', scope = 'https://www.googleapis.com/auth/calendar.events', upstreamStatus = 200,
  omitScope = false, infoScope = 'https://www.googleapis.com/auth/calendar.events', infoStatus = 200, credentialExists = true } = {}) {
  let handler;
  const writes = [];
  let infoRequests = 0;
  let currentScope = scope;
  const api = load('supabase/functions/google-calendar/index.ts', {
    '../_shared/supabaseAuth.ts': {
      corsHeaders: {}, authenticatedUser: async () => ({ id: 'fake-user' }),
      json: (body, status = 200) => Response.json(body, { status }),
      serviceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: credentialExists ? { refresh_token_ciphertext: 'fake-cipher' } : null, error: null }) }) }) }) }),
    },
    '../_shared/credentialCipher.ts': { decryptCredential: async () => 'fake-refresh' },
  }, {
    Deno: { env: { get: () => 'fake-config' }, serve: (callback) => { handler = callback; } },
    fetch: async (url, options) => {
      if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fake-google', ...(omitScope ? {} : { scope: currentScope }) });
      if (url === 'https://oauth2.googleapis.com/tokeninfo') {
        infoRequests += 1;
        assert.equal(options.headers.Authorization, 'Bearer fake-google');
        assert.equal(options.method, 'POST');
        return Response.json({ scope: infoScope }, { status: infoStatus });
      }
      if (url.includes('/users/me/calendarList/')) return Response.json({ accessRole: role });
      writes.push({ url, ...options });
      return upstreamStatus === 204 ? new Response(null, { status: 204 }) : Response.json({ id: 'event' }, { status: upstreamStatus });
    },
  });
  const request = (method, body, headers = { Authorization: 'Bearer fake-session' }) => handler(new Request(`https://example.test?calendarId=calendar%40example.test${method === 'POST' ? '' : '&eventId=event'}`, { method, headers, body: JSON.stringify(body) }));
  const checkConnection = (headers = { Authorization: 'Bearer fake-session' }) => handler(new Request('https://example.test?checkConnection=1', { headers }));
  return { api, request, writes, infoRequests: () => infoRequests, checkConnection, setScope: (nextScope) => { currentScope = nextScope; } };
}

const eventBody = { etag: '"version1"', patch: { summary: 'Título', start: { date: '2026-10-06' }, end: { date: '2026-10-07' } } };
test('el backend limita los campos de escritura y rechaza fechas inexistentes', () => {
  const { api } = backend();
  const patch = api.validatedEventPatch({ ...eventBody.patch, attendees: [{ email: 'not-allowed' }], recurrence: ['not-allowed'] });
  assert.equal(patch.attendees, undefined);
  assert.equal(patch.recurrence, undefined);
  assert.throws(() => api.validatedEventPatch({ ...eventBody.patch, start: { date: '2026-02-30' } }));
});

test('PATCH exige sesión, autorización y calendario escribible; mantiene el etag', async () => {
  for (const options of [{ role: 'reader' }, { scope: 'https://www.googleapis.com/auth/calendar.events.readonly' }]) {
    const fake = backend(options);
    assert.equal((await fake.request('PATCH', eventBody)).status, 403);
    assert.equal(fake.writes.length, 0);
  }
  const fake = backend();
  assert.equal((await fake.request('PATCH', eventBody, {})).status, 401);
  assert.equal((await fake.request('PATCH', { ...eventBody, etag: undefined })).status, 400);
  assert.equal((await fake.request('PATCH', eventBody)).status, 200);
  assert.equal(fake.writes[0].headers['If-Match'], '"version1"');
  assert.match(fake.writes[0].url, /calendar%40example.test\/events\/event\?sendUpdates=all$/);
});

test('DELETE devuelve 204 sin contenido y los conflictos conservan el error 412', async () => {
  const fake = backend({ upstreamStatus: 204 });
  const response = await fake.request('DELETE', { etag: '"version1"' });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(fake.writes[0].body, undefined);
  const conflict = backend({ upstreamStatus: 412 });
  assert.equal((await conflict.request('DELETE', { etag: '"version1"' })).status, 412);
});

test('POST crea sin eventId ni ETag, valida datos y exige sesión, scope y calendario escribible', async () => {
  for (const options of [{ role: 'reader' }, { scope: 'https://www.googleapis.com/auth/calendar.events.readonly' }]) {
    const fake = backend(options);
    assert.equal((await fake.request('POST', { patch: eventBody.patch })).status, 403);
    assert.equal(fake.writes.length, 0);
  }
  const fake = backend({ upstreamStatus: 201 });
  assert.equal((await fake.request('POST', { patch: eventBody.patch }, {})).status, 401);
  assert.equal((await fake.request('POST', { patch: {} })).status, 400);
  assert.equal((await fake.request('POST', { patch: { ...eventBody.patch, attendees: [{ email: 'not-allowed' }] } })).status, 200);
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.writes[0].method, 'POST');
  assert.match(fake.writes[0].url, /calendar%40example.test\/events\?sendUpdates=all$/);
  assert.equal(fake.writes[0].headers['If-Match'], undefined);
  const sent = JSON.parse(fake.writes[0].body);
  assert.equal(sent.start.date, '2026-10-06');
  assert.equal(sent.start.dateTime, undefined);
  assert.equal(sent.attendees, undefined);
});

test('el cliente crea y normaliza un evento con el color y calendario de destino', async () => {
  let sent;
  const client = load('src/integrations/google/googleCalendar.ts', {}, {
    testEnv: { VITE_SUPABASE_URL: 'https://example.test' },
    fetch: async (url, options) => {
      sent = { url: url.toString(), ...options };
      const fields = JSON.parse(options.body).patch;
      return Response.json({ id: 'created', etag: '"v1"', ...fields }, { status: 201 });
    },
  });
  const calendar = { id: 'calendar', name: 'Trabajo', color: '#123456', canEdit: true };
  const event = await client.createGoogleEvent('test-session', calendar, { title: 'Nuevo', date: '2026-10-07', endDate: '2026-10-07' });
  assert.equal(sent.method, 'POST'); assert.doesNotMatch(sent.url, /eventId/);
  assert.equal(event.title, 'Nuevo'); assert.equal(event.endDate, '2026-10-07');
  assert.equal(event.sourceContainerId, 'calendar'); assert.equal(event.color, '#123456');
  assert.equal(event.canEdit, true);
  await assert.rejects(() => client.createGoogleEvent('test', { ...calendar, canEdit: false }, {}), /solo lectura/);
});

test('el formulario de creación ofrece elegir calendario y fecha del día seleccionado', () => {
  const { EventEditorDialog } = load('src/features/calendar/EventEditorDialog.tsx');
  const html = renderToStaticMarkup(React.createElement(EventEditorDialog, {
    entry: { id: 'new', title: '', date: '2026-10-07', source: 'google-calendar', kind: 'event' },
    calendars: [{ id: 'work', name: 'Trabajo', primary: true }], busy: false, onClose() {}, onSave() {},
  }));
  assert.match(html, /Nuevo evento/); assert.match(html, /Crear evento/);
  assert.match(html, /<select/); assert.match(html, /value="work" selected/);
  assert.match(html, /value="2026-10-07"/);
  assert.equal((html.match(/type="date"/g) ?? []).length, 1);
  assert.equal((html.match(/type="time"/g) ?? []).length, 0);
  assert.match(html, /type="checkbox" checked=""/);
  assert.match(html, /Todo el día/);
  assert.doesNotMatch(html, /Fecha de fin|Hora de fin|Fecha de inicio/);
});

test('el editor simplificado usa una fecha y calcula cinco minutos con cambio de día, mes y año', () => {
  const { simpleEventFields, EventEditorDialog } = load('src/features/calendar/EventEditorDialog.tsx');
  const daytime = simpleEventFields('Evento', '2026-10-07', '09:30');
  assert.equal(daytime.endDate, '2026-10-07'); assert.equal(daytime.endTime, '09:35');
  for (const [date, next] of [['2026-10-07', '2026-10-08'], ['2026-10-31', '2026-11-01'], ['2026-12-31', '2027-01-01']]) {
    const midnight = simpleEventFields('Evento', date, '23:58');
    assert.equal(midnight.endDate, next); assert.equal(midnight.endTime, '00:03');
    const patch = googleClient.eventPatch(midnight);
    assert.equal(Date.parse(patch.end.dateTime) - Date.parse(patch.start.dateTime), 5 * 60_000);
  }
  const allDay = simpleEventFields('Evento', '2026-10-07', '');
  assert.equal(allDay.endDate, allDay.date); assert.equal(allDay.time, undefined);
  assert.throws(() => simpleEventFields('Evento', '2026-10-07', '25:00'));
  const html = renderToStaticMarkup(React.createElement(EventEditorDialog, {
    entry: { ...entries[0], endDate: '2026-10-09', endTime: '20:00' }, busy: false, onClose() {}, onSave() {},
  }));
  assert.equal((html.match(/type="date"/g) ?? []).length, 1);
  assert.equal((html.match(/type="time"/g) ?? []).length, 1);
  assert.match(html, /type="time" required=""/);
  assert.doesNotMatch(html, /type="checkbox" checked/);
  assert.match(html, /value="18:30"/);
});

test('editar un evento de día completo conserva el check y oculta la hora', () => {
  const { EventEditorDialog } = load('src/features/calendar/EventEditorDialog.tsx');
  const html = renderToStaticMarkup(React.createElement(EventEditorDialog, {
    entry: { id: 'all-day', title: 'Evento', date: '2026-10-07', source: 'google-calendar', kind: 'event' },
    busy: false, onClose() {}, onSave() {},
  }));
  assert.match(html, /Editar evento/);
  assert.match(html, /type="checkbox" checked=""/);
  assert.doesNotMatch(html, /type="time"/);
  assert.match(html, /Se mantienen los avisos existentes/);
});

test('renovar sin scope comprueba el permiso real y reutiliza la comprobación en caché', async () => {
  const fake = backend({ omitScope: true });
  assert.equal((await fake.request('PATCH', eventBody)).status, 200);
  assert.equal((await fake.request('PATCH', eventBody)).status, 200);
  assert.equal(fake.infoRequests(), 1);
});

test('la comprobación no convierte tokens de lectura ni fallos de tokeninfo en escritura', async () => {
  const reader = backend({ omitScope: true, infoScope: 'https://www.googleapis.com/auth/calendar.events.readonly' });
  assert.equal((await reader.request('PATCH', eventBody)).status, 403);
  assert.equal(reader.writes.length, 0);
  const failure = backend({ omitScope: true, infoStatus: 503 });
  assert.equal((await failure.request('PATCH', eventBody)).status, 502);
  assert.equal(failure.writes.length, 0);
});

test('restaurar Google espera al callback y guarda el permiso una sola vez antes de cargar', async () => {
  const storage = new Map([['mipanel.google.connectionPending', 'true']]);
  let listener;
  let writes = 0;
  let releaseSave;
  let releaseSession;
  const saving = new Promise((resolveSave) => { releaseSave = resolveSave; });
  const initializing = new Promise((resolveSession) => { releaseSession = resolveSession; });
  const session = { access_token: 'fake-session', provider_refresh_token: 'fake-google-refresh' };
  const api = load('src/integrations/google/googleAuth.ts', {
    './googleCalendar': googleClient,
    '../supabase/supabaseClient': {
      supabase: { auth: {
        onAuthStateChange: (callback) => { listener = callback; },
        getSession: async () => { await initializing; return { data: { session } }; },
      } },
    },
  }, {
    testEnv: { VITE_SUPABASE_URL: 'https://example.test' },
    window: { sessionStorage: {
      getItem: (key) => storage.get(key), removeItem: (key) => storage.delete(key),
    }, setTimeout: () => {} },
    fetch: async () => { writes += 1; await saving; return new Response(null, { status: 204 }); },
  });
  let ready = false;
  const restore = api.waitForGoogleCredentialSync().then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(writes, 0);
  listener('SIGNED_IN', session);
  listener('INITIAL_SESSION', session);
  releaseSession();
  await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(writes, 1);
  releaseSave();
  await restore;
  assert.equal(ready, true);
  assert.equal(writes, 1);
});

test('callback sin refresh token comprueba el vault sin escribir ni bloquear una conexión válida', async () => {
  for (const valid of [true, false]) {
    const storage = new Map([['mipanel.google.connectionPending', 'true']]);
    const requests = [];
    const api = load('src/integrations/google/googleAuth.ts', {
      './googleCalendar': googleClient,
      '../supabase/supabaseClient': { supabase: { auth: {
        onAuthStateChange: () => {}, getSession: async () => ({ data: { session: { access_token: 'fake-session' } } }),
      } } },
    }, {
      testEnv: { VITE_SUPABASE_URL: 'https://example.test' },
      window: { sessionStorage: { getItem: (key) => storage.get(key), removeItem: (key) => storage.delete(key) }, setTimeout: (callback) => callback() },
      fetch: async (url, options) => {
        requests.push({ url, ...options });
        return valid ? Response.json({ connected: true, canWriteEvents: true }) : Response.json({ error: { message: 'Vault no disponible' } }, { status: 502 });
      },
    });
    if (valid) {
      assert.equal(await api.waitForGoogleCredentialSync(), true);
      assert.equal(storage.has('mipanel.google.connectionPending'), false);
    } else {
      await assert.rejects(api.waitForGoogleCredentialSync(), /Vault no disponible/);
      assert.equal(storage.has('mipanel.google.connectionPending'), true);
    }
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /google-calendar\?checkConnection=1$/);
    assert.equal(requests[0].method, undefined);
    assert.equal(requests[0].body, undefined);
    assert.equal(requests[0].headers.Authorization, 'Bearer fake-session');
  }
});

test('verificar conexión exige sesión y credencial, renueva los permisos antiguos y no expone tokens', async () => {
  const fake = backend({ scope: 'https://www.googleapis.com/auth/calendar.events.readonly' });
  assert.equal((await fake.request('PATCH', eventBody)).status, 403);
  fake.setScope('https://www.googleapis.com/auth/calendar.events');
  const response = await fake.checkConnection();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { connected: true, canWriteEvents: true });
  assert.equal(fake.writes.length, 0);
  assert.equal((await fake.checkConnection({})).status, 401);
  assert.equal((await backend({ credentialExists: false }).checkConnection()).status, 502);
});

test('autorizar edición de una identidad existente usa OAuth, no vuelve a enlazarla', async () => {
  const storage = new Map();
  let request;
  const api = load('src/integrations/google/googleAuth.ts', {
    './googleCalendar': googleClient,
    '../supabase/supabaseClient': {
      isSupabaseConfigured: () => true, supabaseRedirectUri: () => 'https://example.test/',
      supabase: { auth: {
        onAuthStateChange: () => {},
        getSession: async () => ({ data: { session: { access_token: 'fake-session', user: { id: 'fake-user' } } } }),
        getUserIdentities: async () => ({ data: { identities: [{ provider: 'google', identity_data: { email: 'fake@example.test' } }] } }),
        linkIdentity: () => { throw new Error('No debe volver a enlazar Google'); },
        signInWithOAuth: async (options) => { request = options; return {}; },
      } },
    },
  }, { window: { sessionStorage: {
    getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key),
  } } });
  await api.connectGoogleCalendar(true);
  assert.match(request.options.scopes, /calendar.events /);
  assert.equal(request.options.queryParams.login_hint, 'fake@example.test');
  assert.equal(request.options.queryParams.access_type, 'offline');
  assert.equal(storage.get('mipanel.google.expectedUserId'), 'fake-user');
});

test('un callback de otra cuenta no escribe ni comprueba el vault', async () => {
  const storage = new Map([['mipanel.google.connectionPending', 'true'], ['mipanel.google.expectedUserId', 'expected-user']]);
  const api = load('src/integrations/google/googleAuth.ts', {
    './googleCalendar': googleClient,
    '../supabase/supabaseClient': { supabase: { auth: {
      onAuthStateChange: () => {},
      getSession: async () => ({ data: { session: { access_token: 'fake-session', user: { id: 'other-user' }, provider_refresh_token: 'fake-refresh' } } }),
    } } },
  }, {
    window: { sessionStorage: { getItem: (key) => storage.get(key) } },
    fetch: () => { throw new Error('No debe acceder al vault'); },
  });
  await assert.rejects(api.waitForGoogleCredentialSync(), /no es la vinculada/);
});
