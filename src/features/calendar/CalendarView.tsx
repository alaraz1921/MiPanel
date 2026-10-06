import { useEffect, useMemo, useState } from 'react';
import { useGoogleCalendar } from '../../integrations/google/GoogleCalendarContext';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';
import { monthLabel, startOfMonthGrid, toDateKey } from '../../lib/date';
import type { CalendarEntry, TaskItem } from '../../types';

const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function taskEntries(tasks: TaskItem[]): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const task of tasks) {
    if (task.completed) continue;
    if (task.reminderDateTime) {
      entries.push({
        id: `${task.id}-reminder`,
        title: task.title,
        date: task.reminderDateTime.slice(0, 10),
        time: task.reminderDateTime.slice(11, 16),
        kind: 'reminder',
        source: 'microsoft-todo',
        calendarName: task.listName,
      });
      continue;
    }
    if (task.dueDate) {
      entries.push({
        id: `${task.id}-due`,
        title: task.title,
        date: task.dueDate,
        kind: 'due',
        source: 'microsoft-todo',
        calendarName: task.listName,
      });
    }
  }
  return entries;
}

export function CalendarView() {
  const [cursor, setCursor] = useState(() => new Date());
  const microsoft = useMicrosoftTodo();
  const google = useGoogleCalendar();
  const tasks = microsoft.status === 'connected' ? microsoft.tasks : [];
  const today = toDateKey(new Date());

  const { start, rangeEnd } = useMemo(() => {
    const rangeStart = startOfMonthGrid(cursor);
    const end = new Date(rangeStart);
    end.setDate(end.getDate() + 42);
    return { start: rangeStart, rangeEnd: end };
  }, [cursor]);
  const entries = useMemo(() => [...taskEntries(tasks), ...google.events], [google.events, tasks]);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });

  function moveMonth(delta: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  useEffect(() => {
    if (google.status === 'connected') void google.refresh(start, rangeEnd);
  }, [cursor, google.status, google.visibleCalendarIds]);

  return (
    <section className="panel calendar-panel" aria-labelledby="calendar-title">
      <div className="section-heading calendar-heading">
        <div>
          <span className="eyebrow">Calendario unificado</span>
          <h2 id="calendar-title">{monthLabel(cursor)}</h2>
        </div>
        <div className="calendar-actions">
          <button type="button" className="ghost-button" onClick={() => moveMonth(-1)} aria-label="Mes anterior">←</button>
          <button type="button" className="ghost-button" onClick={() => setCursor(new Date())}>Hoy</button>
          <button type="button" className="ghost-button" onClick={() => moveMonth(1)} aria-label="Mes siguiente">→</button>
        </div>
      </div>

      <div className="calendar-google-controls">
        {google.status === 'connected' ? (
          <>
            <button type="button" className="status-pill status-connected status-action" onClick={() => google.refresh(start, rangeEnd)} disabled={google.busy}>
              {google.busy ? 'Google…' : 'Google conectado'}
            </button>
            <button type="button" className="text-button" onClick={() => void google.disconnect()} disabled={google.busy}>Desconectar Google</button>
          </>
        ) : (
          <button type="button" className="status-pill status-action" onClick={() => void google.connect()} disabled={google.status === 'connecting'}>
            {google.status === 'connecting' ? 'Conectando Google…' : 'Conectar Google'}
          </button>
        )}
      </div>
      {google.error && <p className="calendar-google-error" role="alert">{google.error}</p>}

      <div className="calendar-legend" aria-label="Leyenda">
        <span><i className="legend-dot event-dot" /> Evento</span>
        <span><i className="legend-dot due-dot" /> Vencimiento</span>
        <span><i className="legend-dot reminder-dot" /> Recordatorio</span>
      </div>

      <div className="calendar-grid calendar-weekdays" aria-hidden="true">
        {weekDays.map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="calendar-grid calendar-days">
        {days.map((day) => {
          const key = toDateKey(day);
          const dayEntries = entries.filter((entry) => entry.date === key).slice(0, 3);
          const outside = day.getMonth() !== cursor.getMonth();
          return (
            <div className={`calendar-day${outside ? ' outside' : ''}${key === today ? ' today' : ''}`} key={key}>
              <span className="day-number">{day.getDate()}</span>
              <div className="day-events">
                {dayEntries.map((entry) => (
                  <div
                    className={`calendar-event ${entry.kind}`}
                    key={entry.id}
                    title={`${entry.calendarName ?? ''} ${entry.title}`}
                    style={entry.kind === 'event' && entry.color
                      ? { borderColor: entry.color, backgroundColor: `${entry.color}2b` }
                      : undefined}
                  >
                    <span>{entry.kind === 'reminder' ? '🔔' : entry.kind === 'due' ? '✓' : '•'}</span>
                    <span className="event-text">{entry.time ? `${entry.time} ` : ''}{entry.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {google.status === 'connected' && google.calendars.length > 0 && (
        <fieldset className="calendar-list-filter">
          <legend>Calendarios Google</legend>
          {google.calendars.map((calendar) => (
            <label key={calendar.id}>
              <input
                type="checkbox"
                checked={google.visibleCalendarIds.includes(calendar.id)}
                onChange={(event) => google.setCalendarVisible(calendar.id, event.target.checked)}
              />
              <span className="calendar-color" style={{ background: calendar.color }} />
              {calendar.name}{calendar.primary ? ' (principal)' : ''}
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}
