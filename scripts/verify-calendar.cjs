// Ejecutar: node scripts/verify-calendar.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(path, imports = {}) {
  const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  runInNewContext(output, { module, exports: module.exports, require: (name) => {
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

test('la cabecera ofrece el modal solo cuando hay más de tres elementos', () => {
  const google = { events: [], status: 'disconnected', visibleCalendarIds: [], calendars: [] };
  const { CalendarView } = load('src/features/calendar/CalendarView.tsx', {
    '../../integrations/google/GoogleCalendarContext': { useGoogleCalendar: () => google },
    '../../integrations/microsoft/MicrosoftTodoContext': { useMicrosoftTodo: () => ({ status: 'disconnected' }) },
    '../../lib/date': dateApi,
    './CalendarDayDialog': { CalendarDayDialog },
    './dayEntries': dayApi,
  });
  for (const count of [0, 3, 4, 8]) {
    google.events = Array.from({ length: count }, (_, index) => ({ ...entries[0], id: String(index) }));
    const html = renderToStaticMarkup(React.createElement(CalendarView));
    assert.equal(html.includes('aria-haspopup="dialog"'), count > 3);
    if (count > 3) assert.match(html, new RegExp(`Ver los ${count} elementos`));
  }
});
