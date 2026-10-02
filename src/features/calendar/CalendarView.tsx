import { useMemo, useState } from 'react';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';
import { monthLabel, startOfMonthGrid, toDateKey } from '../../lib/date';
import type { CalendarEntry, TaskItem } from '../../types';

const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function taskEntries(tasks: TaskItem[]): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const task of tasks) {
    if (task.completed) continue;
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
    }
  }
  return entries;
}

export function CalendarView() {
  const [cursor, setCursor] = useState(() => new Date());
  const microsoft = useMicrosoftTodo();
  const tasks = microsoft.status === 'connected' ? microsoft.tasks : [];
  const today = toDateKey(new Date());

  const entries = useMemo(() => taskEntries(tasks), [tasks]);
  const start = startOfMonthGrid(cursor);
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });

  function moveMonth(delta: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

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
                  <div className={`calendar-event ${entry.kind}`} key={entry.id} title={`${entry.calendarName ?? ''} ${entry.title}`}>
                    <span>{entry.kind === 'reminder' ? '🔔' : entry.kind === 'due' ? '✓' : '•'}</span>
                    <span className="event-text">{entry.time ? `${entry.time} ` : ''}{entry.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
