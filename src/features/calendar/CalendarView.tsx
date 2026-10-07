import { useEffect, useMemo, useState } from 'react';
import { useGoogleCalendar } from '../../integrations/google/GoogleCalendarContext';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';
import { dayLabel, monthLabel, startOfMonthGrid, toDateKey } from '../../lib/date';
import type { CalendarEntry, TaskItem } from '../../types';
import { CalendarDayDialog } from './CalendarDayDialog';
import { entriesForDay, VISIBLE_DAY_ENTRIES } from './dayEntries';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { TaskEditorDialog } from '../tasks/TaskEditorDialog';
import { EventEditorDialog } from './EventEditorDialog';

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
        sourceId: task.id,
        sourceContainerId: task.listId,
        canEdit: true,
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
        sourceId: task.id,
        sourceContainerId: task.listId,
        canEdit: true,
      });
    }
  }
  return entries;
}

export function CalendarView() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<CalendarEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<CalendarEntry | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const microsoft = useMicrosoftTodo();
  const google = useGoogleCalendar();
  const writableCalendars = google.calendars.filter((calendar) => calendar.canEdit);
  const canCreate = google.status === 'connected' && google.canWriteEvents && writableCalendars.length > 0;
  const tasks = microsoft.status === 'connected' ? microsoft.tasks : [];
  const today = toDateKey(new Date());
  const actionBusy = google.busy || microsoft.busy || microsoft.updatingTaskIds.length > 0;
  const editingTask = editingEntry?.source === 'microsoft-todo'
    ? microsoft.tasks.find((task) => task.id === editingEntry.sourceId && task.listId === editingEntry.sourceContainerId)
    : undefined;
  const deletionError = deletingEntry?.source === 'google-calendar' ? google.error : microsoft.error;

  async function deleteEntry() {
    if (!deletingEntry) return;
    if (deletingEntry.source === 'google-calendar') {
      if (await google.deleteEvent(deletingEntry)) setDeletingEntry(null);
    } else {
      const task = microsoft.tasks.find((item) => item.id === deletingEntry.sourceId && item.listId === deletingEntry.sourceContainerId);
      if (task && await microsoft.deleteTask(task)) setDeletingEntry(null);
    }
  }

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
          {(google.status === 'connected' || google.status === 'error') && <button type="button" className="ghost-button" disabled={google.busy} onClick={() => void google.refresh(start, rangeEnd)}>{google.busy ? 'Actualizando…' : 'Actualizar'}</button>}
          {google.status === 'connected' && <button type="button" className="primary-button" disabled={!canCreate || google.busy} title={!google.canWriteEvents ? 'Autoriza la edición de eventos en Configuración' : !writableCalendars.length ? 'No hay calendarios con permiso de escritura' : 'Crear evento de Google'} onClick={() => setCreatingDate(today)}>+ Nuevo evento</button>}
          <button type="button" className="ghost-button" onClick={() => moveMonth(-1)} aria-label="Mes anterior">←</button>
          <button type="button" className="ghost-button" onClick={() => setCursor(new Date())}>Hoy</button>
          <button type="button" className="ghost-button" onClick={() => moveMonth(1)} aria-label="Mes siguiente">→</button>
        </div>
      </div>

      {google.status === 'connected' && !google.canWriteEvents && <p className="settings-help">Para crear eventos, autoriza la edición de Google en Configuración.</p>}
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
          const allDayEntries = entriesForDay(entries, key);
          const dayEntries = allDayEntries.slice(0, VISIBLE_DAY_ENTRIES);
          const hiddenCount = allDayEntries.length - dayEntries.length;
          const outside = day.getMonth() !== cursor.getMonth();
          return (
            <div className={`calendar-day${outside ? ' outside' : ''}${key === today ? ' today' : ''}`} key={key}>
              <button
                type="button"
                className="calendar-day-open"
                aria-label={`Ver los ${allDayEntries.length} elementos del ${dayLabel(key)}`}
                aria-haspopup="dialog"
                onClick={() => setSelectedDate(key)}
              >
                <span className="day-number">{day.getDate()}</span>
                {hiddenCount > 0 && <span className="calendar-day-more" aria-hidden="true">+{hiddenCount}</span>}
              </button>
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
      {selectedDate && (
        <CalendarDayDialog
          date={selectedDate}
          entries={entriesForDay(entries, selectedDate)}
          onClose={() => setSelectedDate(null)}
          onEdit={setEditingEntry}
          onDelete={setDeletingEntry}
          busy={actionBusy}
          onCreate={canCreate ? () => { setCreatingDate(selectedDate); setSelectedDate(null); } : undefined}
          error={google.error ?? microsoft.error}
          onAuthorizeGoogle={google.status === 'connected' && !google.canWriteEvents && entriesForDay(entries, selectedDate).some((entry) => entry.source === 'google-calendar' && entry.canEdit)
            ? () => void google.connect(true) : undefined}
        />
      )}
      {editingEntry?.source === 'google-calendar' && (
        <EventEditorDialog entry={editingEntry} busy={google.busy} error={google.error} onClose={() => setEditingEntry(null)} onSave={(fields) => google.updateEvent(editingEntry, fields)} />
      )}
      {creatingDate && <EventEditorDialog entry={{ id: 'new', title: '', date: creatingDate, kind: 'event', source: 'google-calendar' }} calendars={writableCalendars} busy={google.busy} error={google.error} onClose={() => setCreatingDate(null)} onSave={(fields, calendarId) => google.createEvent(calendarId ?? '', fields)} />}
      {editingTask && (
        <TaskEditorDialog task={editingTask} listName={editingTask.listName}
          busy={microsoft.updatingTaskIds.includes(`${editingTask.listId}:${editingTask.id}`)} error={microsoft.error}
          onCancel={() => setEditingEntry(null)} onSave={(fields) => microsoft.updateTask(editingTask, fields)} />
      )}
      {deletingEntry && (
        <ConfirmDialog
          title={deletingEntry.source === 'google-calendar' ? 'Eliminar evento' : 'Eliminar tarea'}
          message={`¿Quieres eliminar “${deletingEntry.title}”? Esta acción no se puede deshacer.${deletingEntry.recurring ? ' Solo se eliminará esta ocurrencia, no toda la serie.' : ''}${deletingEntry.source === 'google-calendar' ? ' Google notificará a los invitados, si los hay.' : ''}${deletionError ? ` ${deletionError}` : ''}`}
          confirmLabel="Eliminar" danger busy={actionBusy} onCancel={() => setDeletingEntry(null)} onConfirm={() => void deleteEntry()}
        />
      )}
    </section>
  );
}
