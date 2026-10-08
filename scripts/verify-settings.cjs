// Ejecutar: node scripts/verify-settings.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(path, imports = {}, globals = {}) {
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '..', path), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(output, { module, exports: module.exports, URL, ...globals, require: (name) => {
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
  for (const id of ['copias', 'fondo', 'accesos', 'microsoft', 'google']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /Abrir enlaces en una pestaña nueva/);
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
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  assert.match(html, /Trabajo/); assert.match(html, /Personal/);
});

test('carpetas: mover, sacar, ordenar y eliminar no pierde enlaces ni permite carpetas anidadas', () => {
  const api = load('src/features/shortcuts/shortcutFolders.ts');
  const items = [
    { id: 'folder', label: 'Trabajo', url: '', kind: 'folder' },
    { id: 'a', label: 'A', url: 'https://a.test' },
    { id: 'b', label: 'B', url: 'https://b.test', folderId: 'folder' },
    { id: 'c', label: 'C', url: 'https://c.test', folderId: 'folder' },
  ];
  const moved = api.moveToFolder(items, 'a', 'folder');
  assert.deepEqual(Array.from(api.shortcutsInFolder(moved), (item) => item.id), ['folder']);
  assert.deepEqual(Array.from(api.shortcutsInFolder(moved, 'folder'), (item) => item.id), ['a', 'b', 'c']);
  assert.equal(api.moveToFolder(items, 'folder', 'folder'), items);
  assert.equal(api.moveToFolder(items, 'a', 'missing'), items);
  assert.equal(api.reorderShortcut(items, 'a', 'b'), items);
  assert.deepEqual(Array.from(api.shortcutsInFolder(api.reorderShortcut(moved, 'c', 'a'), 'folder'), (item) => item.id), ['c', 'a', 'b']);
  const removed = api.removeShortcutItem(moved, 'folder');
  assert.equal(removed.length, 3);
  assert.equal(api.shortcutsInFolder(removed).length, 3);
  assert.equal(api.shortcutsInFolder(api.moveToFolder(moved, 'b')).length, 2);
  assert.equal(items[1].folderId, undefined);
});

test('la UI crea una carpeta, abre su modal y permite añadir y sacar enlaces sin perderlos', () => {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0, nextId = 0, newTab = false;
  let items = [{ id: 'old', label: 'Original', url: 'https://example.test' }];
  const { Shortcuts } = load('src/features/shortcuts/Shortcuts.tsx', {
    react: {
      useEffect() {},
      useRef(initial) { const index = refIndex++; refs[index] ??= { current: initial }; return refs[index]; },
      useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    },
    '../../components/ConfirmDialog': { ConfirmDialog: () => null },
    '../../data/mock': { defaultShortcuts: [] },
    '../../hooks/useLocalStorage': { useLocalStorage: (key) => key.endsWith('openInNewTab') ? [newTab, () => {}] : [items, (value) => { items = typeof value === 'function' ? value(items) : value; }] },
    './ShortcutIcon': { ShortcutIcon: () => null },
    './ShortcutFolderDialog': { ShortcutFolderDialog: () => null },
    './shortcutFolders': load('src/features/shortcuts/shortcutFolders.ts'),
  }, { crypto: { randomUUID: () => `new-${++nextId}` }, window: { innerWidth: 1200, innerHeight: 900 } });
  function render() { stateIndex = refIndex = 0; return Shortcuts(); }
  function elements(node) {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== 'object') return [];
    return [node, ...elements(node.props?.children)];
  }
  function find(predicate) { const element = elements(render()).find(predicate); assert.ok(element); return element; }
  const addButton = () => find((node) => node.props?.className === 'shortcut-link shortcut-add-card');
  addButton().props.onClick();
  find((node) => node.props?.['aria-label'] === 'Tipo de acceso').props.onChange({ target: { value: 'folder' } });
  find((node) => node.props?.['aria-label'] === 'Nombre del acceso').props.onChange({ target: { value: 'Trabajo' } });
  assert.equal(elements(render()).some((node) => node.props?.['aria-label'] === 'URL del acceso'), false);
  find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(items.length, 2); assert.equal(items[1].kind, 'folder');
  find((node) => node.props?.className === 'shortcut-link shortcut-folder-card').props.onClick();
  assert.equal(find((node) => node.props?.title === 'Trabajo' && node.props?.onClose).props.title, 'Trabajo');
  addButton().props.onClick();
  find((node) => node.props?.['aria-label'] === 'Nombre del acceso').props.onChange({ target: { value: 'Correo' } });
  find((node) => node.props?.['aria-label'] === 'URL del acceso').props.onChange({ target: { value: 'mail.example.test' } });
  find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(items[2].folderId, 'new-1'); assert.equal(items[2].url, 'https://mail.example.test');
  let link = find((node) => node.type === 'a' && node.props.href === 'https://mail.example.test');
  assert.equal(link.props.target, undefined);
  newTab = true;
  link = find((node) => node.type === 'a' && node.props.href === 'https://mail.example.test');
  assert.equal(link.props.target, '_blank'); assert.equal(link.props.rel, 'noopener noreferrer');
  find((node) => node.props?.title === 'Trabajo' && node.props?.onClose).props.onClose();
  assert.equal(elements(render()).some((node) => node.type === 'a' && node.props.href === 'https://mail.example.test'), false);
  // Editar un enlace existente permite escoger su carpeta sin cambiar su URL.
  find((node) => node.props?.className === 'shortcut-item' && node.key === 'old').props.onContextMenu({ preventDefault() {}, clientX: 10, clientY: 20 });
  find((node) => node.props?.role === 'menuitem').props.onClick();
  find((node) => node.props?.onFolderChange).props.onFolderChange('new-1');
  find((node) => node.props?.onFolderChange).props.onSave({ preventDefault() {} });
  assert.equal(items[0].folderId, 'new-1'); assert.equal(items[0].url, 'https://example.test');
  // Cancelar el alta oculta los campos y descarta el borrador sin guardar nada.
  addButton().props.onClick();
  find((node) => node.props?.['aria-label'] === 'Nombre del acceso').props.onChange({ target: { value: 'No guardar' } });
  find((node) => node.props?.className === 'ghost-button' && node.props.children === 'Cancelar').props.onClick();
  assert.equal(items.length, 3);
  assert.equal(elements(render()).some((node) => node.type === 'form'), false);
  addButton().props.onClick();
  assert.equal(find((node) => node.props?.['aria-label'] === 'Nombre del acceso').props.value, '');
});

test('el formulario de alta dispone los campos en una columna y limita el selector de icono', () => {
  const css = readFileSync(resolve(__dirname, '..', 'src/styles.css'), 'utf8');
  assert.match(css, /\.shortcut-form\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.shortcut-form \.shortcut-icon-picker input\[type="file"\]\s*\{[^}]*max-width:\s*100%/);
  assert.match(css, /\.shortcut-form-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.shortcut-form-actions \.ghost-button\s*\{[^}]*background:\s*rgba\(255,255,255,\.85\)/);
  assert.match(css, /\.shortcut-form-actions \.ghost-button:focus-visible\s*\{[^}]*outline:/);
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
      calendars: [{ id: 'a', name: 'Trabajo', canEdit: true }], events: [{ id: 'event', sourceContainerId: 'a' }], canWriteEvents: true,
    }), createGoogleEvent: async (_token, calendar, fields) => ({ id: 'created', title: fields.title, sourceContainerId: calendar.id }) },
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
  context().setCalendarVisible('a', false);
  await context().refresh(new Date(), new Date());
  assert.equal(await context().createEvent('a', { title: 'Nuevo', date: '2026-10-07', endDate: '2026-10-07' }), true);
  assert.deepEqual(Array.from(context().visibleCalendarIds), ['a']);
  assert.equal(context().events[0].title, 'Nuevo');
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
