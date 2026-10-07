import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CalendarEntry, CalendarEventFields } from '../../types';
import type { GoogleCalendarItem } from '../../integrations/google/googleCalendar';

type EventEditorDialogProps = {
  entry: CalendarEntry;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (fields: CalendarEventFields, calendarId?: string) => Promise<boolean>;
  calendars?: GoogleCalendarItem[];
};

export function simpleEventFields(title: string, date: string, time: string): CalendarEventFields {
  if (!time) return { title, date, endDate: date };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Indica una hora válida.');
  const [hour, minute] = time.split(':').map(Number);
  const endMinutes = hour * 60 + minute + 5;
  let endDate = date;
  if (endMinutes >= 24 * 60) {
    const nextDay = new Date(`${date}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    endDate = nextDay.toISOString().slice(0, 10);
  }
  const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
  return { title, date, time, endDate, endTime };
}

export function EventEditorDialog({ entry, busy, error, onClose, onSave, calendars }: EventEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(entry.title);
  const [date, setDate] = useState(entry.date);
  const [allDay, setAllDay] = useState(!entry.time);
  const [time, setTime] = useState(entry.time ?? '08:00');
  const [failed, setFailed] = useState(false);
  const [validationError, setValidationError] = useState<string>();
  const [calendarId, setCalendarId] = useState(entry.sourceContainerId ?? calendars?.find((calendar) => calendar.primary)?.id ?? calendars?.[0]?.id ?? '');

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setValidationError(undefined);
    try {
      if (!allDay && !time) throw new Error('Indica una hora válida.');
      const saved = await onSave(simpleEventFields(title, date, allDay ? '' : time), calendarId);
      if (saved) onClose();
      else setFailed(true);
    } catch (failure) {
      setValidationError(failure instanceof Error ? failure.message : 'Revisa la fecha y hora del evento.');
    }
  }

  return (
    <dialog ref={dialogRef} className="task-dialog" aria-labelledby="event-editor-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <form className="task-editor" onSubmit={(event) => void submit(event)}>
        <div><span className="eyebrow">{entry.calendarName ?? 'Google Calendar'}</span><h3 id="event-editor-title">{calendars ? 'Nuevo evento' : 'Editar evento'}</h3></div>
        {calendars && <label><span>Calendario</span><select required disabled={busy} value={calendarId} onChange={(event) => setCalendarId(event.target.value)}>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>}
        <label><span>Título</span><input type="text" autoFocus required maxLength={1024} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="task-editor-important"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} /><span>Todo el día</span></label>
        <div className="task-editor-dates">
          <label><span>Fecha</span><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          {!allDay && <label><span>Hora</span><input type="time" required value={time} onChange={(event) => setTime(event.target.value)} /></label>}
        </div>
        <p className="event-editor-note">{allDay ? 'El evento ocupará todo el día seleccionado. Se mantienen los avisos existentes o los predeterminados del calendario.' : 'Al guardar, el evento durará 5 minutos desde la hora indicada.'}</p>
        <p className="event-editor-note">{entry.recurring ? 'Solo se modificará esta ocurrencia, no toda la serie. ' : ''}Las horas se muestran en la zona horaria de tu navegador. Google notificará los cambios a los invitados, si los hay.</p>
        {failed && error && <p className="task-editor-error" role="alert">{error}</p>}
        {validationError && <p className="task-editor-error" role="alert">{validationError}</p>}
        <div className="task-dialog-actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={busy || !title.trim() || Boolean(calendars && !calendarId)}>{busy ? 'Guardando…' : calendars ? 'Crear evento' : 'Guardar cambios'}</button>
        </div>
      </form>
    </dialog>
  );
}
