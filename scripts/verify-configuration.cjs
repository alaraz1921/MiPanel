// Copias portátiles: validación, exclusión de sesiones y recuperación ante cuota.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function environment(initial = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    failNextKey: undefined,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (this.failNextKey === key) {
        this.failNextKey = undefined;
        throw new Error('QuotaExceededError');
      }
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
  const window = new EventTarget();
  window.localStorage = storage;
  const cache = new Map();
  const updates = [];
  function load(relativePath) {
    if (cache.has(relativePath)) return cache.get(relativePath);
    const source = readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const module = { exports: {} };
    const imports = {
      '../../data/mock': 'src/data/mock.ts',
      '../../storage/localStorageAdapter': 'src/storage/localStorageAdapter.ts',
      '../storage/localStorageAdapter': 'src/storage/localStorageAdapter.ts',
    };
    runInNewContext(output, {
      module, exports: module.exports, URL, TextEncoder, window, CustomEvent,
      require: (name) => {
        if (name === 'react') return {
          useEffect: (effect) => effect(),
          useState: (value) => [value, (next) => updates.push(next)],
        };
        if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
        return load(imports[name]);
      },
    });
    cache.set(relativePath, module.exports);
    return module.exports;
  }
  return { values, storage, window, updates, load, api: load('src/features/settings/configuration.ts') };
}

const picture = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZxkAAAAASUVORK5CYII=';
test('exporta correctamente cuando Google aún no tiene una selección inicial', () => {
  const { api } = environment({ 'mipanel.google.visibleCalendarIds': 'null' });
  assert.deepEqual(JSON.parse(api.exportConfiguration()).settings.googleVisibleCalendarIds, []);
});
function backup() {
  return {
    format: 'mipanel-configuration', version: 1, exportedAt: '2026-10-06T09:00:00.000Z',
    settings: {
      shortcuts: [
        { id: 'first', label: 'Página personal', url: 'https://example.test/page', customIcon: picture },
        { id: 'second', label: 'Otro enlace', url: 'http://example.test', icon: '🔗' },
      ],
      backgroundImage: picture, microsoftSelectedListId: 'my-list', googleVisibleCalendarIds: ['my-calendar'], openInNewTab: false,
    },
  };
}

test('exporta solo preferencias permitidas y conserva orden e imágenes', () => {
  const settings = backup().settings;
  const { api, storage } = environment({
    'mipanel.shortcuts': JSON.stringify(settings.shortcuts),
    'mipanel.backgroundImage': JSON.stringify(settings.backgroundImage),
    'mipanel.microsoft.selectedListId': JSON.stringify(settings.microsoftSelectedListId),
    'mipanel.google.visibleCalendarIds': JSON.stringify(settings.googleVisibleCalendarIds),
    'sb-example-auth-token': 'private-session',
    'mipanel.microsoft.accountHint': 'private-account',
    'mipanel.mockTasks': 'private-tasks',
  });
  const content = api.exportConfiguration(storage);
  assert.doesNotMatch(content, /private-session|private-account|private-tasks|sb-example/);
  const parsed = api.parseConfiguration(content);
  assert.equal(JSON.stringify(parsed.settings), JSON.stringify(settings));
});

test('las copias conservan carpetas, pertenencia y preferencia de nueva pestaña', () => {
  const input = backup();
  input.settings.shortcuts.unshift({ id: 'folder', label: 'Trabajo', url: '', kind: 'folder' });
  input.settings.shortcuts[1].folderId = 'folder';
  input.settings.openInNewTab = true;
  const { api, storage } = environment();
  api.importConfiguration(input);
  const exported = JSON.parse(api.exportConfiguration(storage));
  assert.deepEqual(exported.settings, input.settings);
  assert.equal(storage.getItem('mipanel.shortcuts.openInNewTab'), 'true');
  delete input.settings.openInNewTab;
  assert.equal(api.validateConfiguration(input).settings.openInNewTab, false);
});

test('las copias rechazan carpetas anidadas, huérfanos y preferencias mal tipadas', () => {
  const { api } = environment();
  const input = backup();
  input.settings.shortcuts[0].folderId = 'missing';
  assert.throws(() => api.validateConfiguration(input), /carpeta inexistente/);
  delete input.settings.shortcuts[0].folderId;
  input.settings.shortcuts.unshift({ id: 'folder', label: 'Trabajo', url: '', kind: 'folder', folderId: 'folder' });
  assert.throws(() => api.validateConfiguration(input), /otra carpeta/);
  delete input.settings.shortcuts[0].folderId;
  input.settings.shortcuts[0].url = 'javascript:alert(1)';
  assert.throws(() => api.validateConfiguration(input), /enlace/);
  input.settings.shortcuts[0].url = '';
  input.settings.openInNewTab = 'yes';
  assert.throws(() => api.validateConfiguration(input), /pestaña nueva/);
});

test('no modifica almacenamiento al previsualizar una copia y elimina campos desconocidos', () => {
  const { api, values } = environment();
  const input = backup();
  input.session = 'private-token';
  input.settings.access_token = 'private-token';
  input.settings.shortcuts[0].password = 'private-token';
  const parsed = api.parseConfiguration(JSON.stringify(input));
  assert.doesNotMatch(JSON.stringify(parsed), /private-token|access_token|password/);
  assert.equal(values.size, 0);
});

test('rechaza JSON inválido, formato ajeno y versiones no compatibles', () => {
  const { api } = environment();
  assert.throws(() => api.parseConfiguration('{broken'), /JSON válido/);
  assert.throws(() => api.parseConfiguration('{}'), /no es una copia/);
  assert.throws(() => api.validateConfiguration({ ...backup(), version: 2 }), /versión/);
});

test('rechaza enlaces ejecutables y accesos duplicados', () => {
  const { api } = environment();
  const input = backup();
  input.settings.shortcuts[0].url = 'javascript:alert(1)';
  assert.throws(() => api.validateConfiguration(input), /HTTP o HTTPS/);
  input.settings.shortcuts[0].url = 'https://example.test';
  input.settings.shortcuts[1].id = input.settings.shortcuts[0].id;
  assert.throws(() => api.validateConfiguration(input), /repetidos/);
});

test('rechaza imágenes ajenas y archivos demasiado grandes', () => {
  const { api } = environment();
  const input = backup();
  input.settings.backgroundImage = 'https://example.test/tracker';
  assert.throws(() => api.validateConfiguration(input), /imagen/);
  input.settings.backgroundImage = '';
  input.settings.shortcuts[0].customIcon = 'data:text/html;base64,PGgxPkhlbGxvPC9oMT4=';
  assert.throws(() => api.validateConfiguration(input), /imagen/);
  assert.throws(() => api.parseConfiguration(' '.repeat(api.MAX_CONFIGURATION_BYTES + 1)), /16 MB/);
});

test('importa al almacenamiento y notifica a los componentes sin tocar sesiones', () => {
  const { api, storage, values, load, updates } = environment({ 'sb-example-auth-token': 'existing-session' });
  load('src/hooks/useLocalStorage.ts').useLocalStorage('mipanel.backgroundImage', '');
  api.importConfiguration(backup());
  assert.equal(storage.getItem('sb-example-auth-token'), 'existing-session');
  assert.equal(JSON.parse(values.get('mipanel.shortcuts'))[0].id, 'first');
  assert.equal(updates.at(-1), picture);
});

test('una copia vacía permite quitar fondo y accesos de forma explícita', () => {
  const { api, storage } = environment({ 'mipanel.backgroundImage': JSON.stringify(picture) });
  const input = backup();
  input.settings.shortcuts = [];
  input.settings.backgroundImage = '';
  api.importConfiguration(input);
  assert.equal(storage.getItem('mipanel.shortcuts'), '[]');
  assert.equal(storage.getItem('mipanel.backgroundImage'), '""');
});

test('si falla una escritura restaura todos los originales y no emite éxito', () => {
  const initial = {
    'mipanel.shortcuts': JSON.stringify([{ id: 'old', label: 'Original', url: 'https://example.test' }]),
    'mipanel.backgroundImage': JSON.stringify(''),
    'sb-example-auth-token': 'existing-session',
  };
  const { api, storage, values, window } = environment(initial);
  let notifications = 0;
  window.addEventListener('mipanel:preferences-replaced', () => { notifications += 1; });
  storage.failNextKey = 'mipanel.backgroundImage';
  assert.throws(() => api.importConfiguration(backup()), /conservado la configuración anterior/);
  assert.deepEqual(Object.fromEntries(values), initial);
  assert.equal(notifications, 0);
});
