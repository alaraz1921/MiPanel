import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CalendarEntry, CalendarEventFields } from '../../types';

type EventEditorDialogProps = {
  entry: CalendarEntry;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSave: (fields: CalendarEventFields) => Promise<boolean>;
};

export function EventEditorDialog({ entry, busy, error, onClose, onSave }: EventEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(entry.title);
  const [allDay, setAllDay] = useState(!entry.time);
  const [date, setDate] = useState(entry.date);
  const [endDate, setEndDate] = useState(entry.endDate ?? entry.date);
  const [time, setTime] = useState(entry.time ?? '09:00');
  const [endTime, setEndTime] = useState(entry.endTime ?? '10:00');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await onSave({ title, date, endDate, time: allDay ? undefined : time, endTime: allDay ? undefined : endTime });
    if (saved) onClose();
    else setFailed(true);
  }

  return (
    <dialog ref={dialogRef} className="task-dialog" aria-labelledby="event-editor-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <form className="task-editor" onSubmit={(event) => void submit(event)}>
        <div><span className="eyebrow">{entry.calendarName}</span><h3 id="event-editor-title">Editar evento</h3></div>
        <label><span>Título</span><input type="text" autoFocus required maxLength={1024} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="task-editor-important"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />Todo el día</label>
        <div className="task-editor-dates">
          <label><span>Fecha de inicio</span><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label><span>{allDay ? 'Fecha de fin (incluida)' : 'Fecha de fin'}</span><input type="date" required min={date} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        </div>
        {!allDay && <div className="task-editor-dates">
          <label><span>Hora de inicio</span><input type="time" required value={time} onChange={(event) => setTime(event.target.value)} /></label>
          <label><span>Hora de fin</span><input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
        </div>}
        <p className="event-editor-note">{entry.recurring ? 'Solo se modificará esta ocurrencia, no toda la serie. ' : ''}Las horas se muestran en la zona horaria de tu navegador. Google notificará los cambios a los invitados, si los hay.</p>
        {failed && error && <p className="task-editor-error" role="alert">{error}</p>}
        <div className="task-dialog-actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={busy || !title.trim()}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </form>
    </dialog>
  );
}
