// Ejecutar: node scripts/verify-settings.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(path, imports = {}) {
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '..', path), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(output, { module, exports: module.exports, URL, require: (name) => {
    if (name in imports) return imports[name];
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    throw new Error(`Unexpected import: ${name}`);
  } });
  return module.exports;
}

const { ConfigurationSettings } = load('src/features/settings/ConfigurationSettings.tsx', {
  '../../components/ConfirmDialog': { ConfirmDialog: () => null }, './configuration': {},
});
const { BackgroundSettings } = load('src/features/background/BackgroundSettings.tsx');
const microsoft = { status: 'disconnected' };
const google = { status: 'disconnected', calendars: [], visibleCalendarIds: [] };
const { SettingsPage } = load('src/features/settings/SettingsPage.tsx', {
  '../../hooks/useLocalStorage': { useLocalStorage: () => ['', () => {}] },
  '../../integrations/microsoft/MicrosoftTodoContext': { useMicrosoftTodo: () => microsoft },
  '../../integrations/google/GoogleCalendarContext': { useGoogleCalendar: () => google },
  '../../integrations/supabase/supabaseClient': { supabase: undefined },
  '../background/BackgroundSettings': { BackgroundSettings }, './ConfigurationSettings': { ConfigurationSettings },
});

test('los cuatro apartados son una página, no un modal, y ofrecen conexión sin cuentas', () => {
  const html = renderToStaticMarkup(React.createElement(SettingsPage, { onBack() {} }));
  for (const id of ['copias', 'fondo', 'microsoft', 'google']) assert.match(html, new RegExp(`id="${id}"`));
  for (const label of ['Volver al panel', 'Exportar configuración', 'Importar una copia', 'Guardar fondo', 'Conectar Microsoft', 'Conectar Google']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /<dialog|role="dialog"/);
});

test('las cuentas conectadas ofrecen desconectar y selección de calendarios', () => {
  microsoft.status = 'connected'; google.status = 'connected';
  google.calendars = [{ id: 'a', name: 'Trabajo', color: '#123456' }, { id: 'b', name: 'Personal' }];
  google.visibleCalendarIds = ['a'];
  const html = renderToStaticMarkup(React.createElement(SettingsPage, { onBack() {} }));
  assert.match(html, /Desconectar Microsoft/); assert.match(html, /Desconectar Google/);
  assert.match(html, /Autorizar edición de eventos/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  assert.match(html, /Trabajo/); assert.match(html, /Personal/);
});

test('el inicio solo ofrece configuración, sin el antiguo botón de fondo', () => {
  const { TopBar } = load('src/components/TopBar.tsx', { '../assets/configuration.png': 'config.png' });
  const html = renderToStaticMarkup(React.createElement(TopBar, { onOpenSettings() {} }));
  assert.match(html, /Abrir configuración/); assert.doesNotMatch(html, /Cambiar fondo|<dialog/);
});

test('ocultar el último calendario no restaura todos al actualizar', async () => {
  let preferences = null;
  let stateIndex = 0;
  const states = [];
  const hooks = {
    createContext: () => ({ Provider: () => null }), useEffect() {}, useRef: () => ({ current: false }),
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
  };
  const { GoogleCalendarProvider } = load('src/integrations/google/GoogleCalendarContext.tsx', {
    react: hooks,
    '../../hooks/useLocalStorage': { useLocalStorage: () => [preferences, (next) => { preferences = typeof next === 'function' ? next(preferences) : next; }] },
    './googleAuth': { googleSupabaseSession: async () => ({ access_token: 'test' }) },
    './googleCalendar': { isGoogleConfigured: () => true, fetchGoogleCalendarSnapshot: async () => ({
      calendars: [{ id: 'a', name: 'Trabajo' }], events: [{ id: 'event', sourceContainerId: 'a' }], canWriteEvents: false,
    }) },
  });
  function context() { stateIndex = 0; return GoogleCalendarProvider({ children: null }).props.value; }
  await context().refresh(new Date(), new Date());
  assert.deepEqual(Array.from(context().visibleCalendarIds), ['a']);
  context().setCalendarVisible('a', false);
  await context().refresh(new Date(), new Date());
  assert.equal(context().visibleCalendarIds.length, 0);
  assert.equal(context().events.length, 0);
  context().setCalendarVisible('a', true);
  await context().refresh(new Date(), new Date());
  assert.equal(context().events.length, 1);
});

test('los accesos conservan prioridad del icono personalizado y después el favicon', () => {
  const { ShortcutIcon } = load('src/features/shortcuts/ShortcutIcon.tsx');
  const shortcut = { id: 's', label: 'Correo', url: 'https://mail.example.test/inbox' };
  let html = renderToStaticMarkup(React.createElement(ShortcutIcon, { shortcut }));
  assert.match(html, /src="https:\/\/mail.example.test\/favicon.ico"/);
  assert.doesNotMatch(html, /<svg/);
  html = renderToStaticMarkup(React.createElement(ShortcutIcon, { shortcut: { ...shortcut, customIcon: 'data:image/png;base64,AAAA' } }));
  assert.match(html, /src="data:image\/png;base64,AAAA"/);
  assert.doesNotMatch(html, /favicon.ico|<svg/);
});

test('un favicon fallido usa un SVG negro sin relleno y reintenta al cambiar el dominio', () => {
  const state = [];
  let index = 0;
  const { ShortcutIcon } = load('src/features/shortcuts/ShortcutIcon.tsx', { react: {
    useState() {
      const current = index++;
      return [state[current], (value) => { state[current] = value; }];
    },
  } });
  function icon(url) { index = 0; return ShortcutIcon({ shortcut: { id: 's', label: 'Calendario', url } }); }
  const image = icon('https://example.test');
  assert.equal(image.type, 'img'); image.props.onError();
  const fallback = icon('https://example.test');
  assert.equal(fallback.type, 'svg');
  assert.equal(fallback.props.stroke, '#000'); assert.equal(fallback.props.fill, 'none');
  assert.equal(icon('https://other.test').type, 'img');
});

test('los dibujos alternativos reconocen categorías y usan mundo para enlaces desconocidos', () => {
  const { fallbackKind, faviconUrl } = load('src/features/shortcuts/ShortcutIcon.tsx');
  for (const [label, kind] of [['Correo', 'mail'], ['Calendario', 'calendar'], ['Tareas', 'tasks'], ['OneDrive', 'cloud'], ['Maps', 'map'], ['ChatGPT', 'ai'], ['Mi página', 'globe']]) {
    assert.equal(fallbackKind({ label, url: 'https://example.test' }), kind);
  }
  assert.equal(faviconUrl('invalid'), undefined);
  assert.equal(faviconUrl('javascript:alert(1)'), undefined);
});
