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
const { CalendarDayDialog } = load('src/features/calendar/CalendarDayDialog.tsx', { '../../lib/date': dateApi });
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
  }
});

test('la agenda ofrece editar y eliminar solo en elementos editables', () => {
  const html = renderToStaticMarkup(React.createElement(CalendarDayDialog, {
    date, entries: [{ ...entries[0], canEdit: true }, { ...entries[1], canEdit: false }],
    onClose: () => {}, onEdit: () => {}, onDelete: () => {},
  }));
  assert.equal((html.match(/>Editar</g) ?? []).length, 1);
  assert.equal((html.match(/>Eliminar</g) ?? []).length, 1);
  const reading = renderToStaticMarkup(React.createElement(CalendarDayDialog, {
    date, entries: [{ ...entries[0], canEdit: true }],
    onClose: () => {}, onEdit: () => {}, onDelete: () => {}, onAuthorizeGoogle: () => {},
  }));
  assert.match(reading, /Autorizar edición/);
  assert.equal((reading.match(/disabled=""/g) ?? []).length, 2);
});

test('completar tareas no usa un label envolvente ni confirmación y solo el título y check son activadores', () => {
  const { TaskPanel } = load('src/features/tasks/TaskPanel.tsx', {
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
        getSession: async () => ({ data: { session: { access_token: 'fake-session' } } }),
        linkIdentity: async (request) => { requests.push(request); return {}; },
      } },
    },
  }, { window: { sessionStorage: { setItem: () => {}, removeItem: () => {} } } });
  await api.connectGoogleCalendar();
  await api.connectGoogleCalendar(true);
  assert.match(requests[0].options.scopes, /calendar.events.readonly/);
  assert.doesNotMatch(requests[1].options.scopes, /events.readonly/);
  assert.match(requests[1].options.scopes, /calendar.events /);
  assert.match(requests[1].options.scopes, /calendar.calendarlist.readonly/);
  assert.doesNotMatch(requests[1].options.scopes, /tasks/);
});

function backend({ role = 'owner', scope = 'https://www.googleapis.com/auth/calendar.events', upstreamStatus = 200 } = {}) {
  let handler;
  const writes = [];
  const api = load('supabase/functions/google-calendar/index.ts', {
    '../_shared/supabaseAuth.ts': {
      corsHeaders: {}, authenticatedUser: async () => ({ id: 'fake-user' }),
      json: (body, status = 200) => Response.json(body, { status }),
      serviceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { refresh_token_ciphertext: 'fake-cipher' }, error: null }) }) }) }) }),
    },
    '../_shared/credentialCipher.ts': { decryptCredential: async () => 'fake-refresh' },
  }, {
    Deno: { env: { get: () => 'fake-config' }, serve: (callback) => { handler = callback; } },
    fetch: async (url, options) => {
      if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fake-google', scope });
      if (url.includes('/users/me/calendarList/')) return Response.json({ accessRole: role });
      writes.push({ url, ...options });
      return upstreamStatus === 204 ? new Response(null, { status: 204 }) : Response.json({ id: 'event' }, { status: upstreamStatus });
    },
  });
  const request = (method, body, headers = { Authorization: 'Bearer fake-session' }) => handler(new Request('https://example.test?calendarId=calendar%40example.test&eventId=event', { method, headers, body: JSON.stringify(body) }));
  return { api, request, writes };
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
