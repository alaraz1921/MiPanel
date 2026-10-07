import { useEffect, useRef } from 'react';
import { dayLabel } from '../../lib/date';
import type { CalendarEntry } from '../../types';
import editTaskIcon from '../../assets/edit-task.png';
import deleteTaskIcon from '../../assets/delete-task.png';

type CalendarDayDialogProps = {
  date: string;
  entries: CalendarEntry[];
  onClose: () => void;
  onEdit?: (entry: CalendarEntry) => void;
  onDelete?: (entry: CalendarEntry) => void;
  busy?: boolean;
  error?: string;
  onAuthorizeGoogle?: () => void;
  onCreate?: () => void;
};

const kindLabels = { event: 'Evento', due: 'Vencimiento', reminder: 'Recordatorio' };

export function CalendarDayDialog({ date, entries, onClose, onEdit, onDelete, busy, error, onAuthorizeGoogle, onCreate }: CalendarDayDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="calendar-day-dialog"
      aria-labelledby="calendar-day-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="calendar-day-dialog-content">
        <div className="section-heading">
          <h3 id="calendar-day-dialog-title">{dayLabel(date)}</h3>
          <div className="calendar-actions">{onCreate && <button type="button" className="primary-button" disabled={busy} onClick={onCreate}>+ Nuevo evento</button>}<button type="button" className="ghost-button" onClick={onClose} autoFocus>Cerrar</button></div>
        </div>
        {onAuthorizeGoogle && <p className="calendar-agenda-notice">Google está conectado en modo lectura. <button type="button" className="entry-action-button" disabled={busy} onClick={onAuthorizeGoogle}>Autorizar edición</button></p>}
        {error && <p className="calendar-google-error" role="alert">{error}</p>}
        {entries.length === 0 ? <p>No hay elementos para este día.</p> : (
          <ol className="calendar-day-agenda">
            {entries.map((entry) => (
              <li
                className={`calendar-event ${entry.kind}`}
                key={`${entry.source}-${entry.id}`}
                style={entry.kind === 'event' && entry.color
                  ? { borderColor: entry.color, backgroundColor: `${entry.color}2b` }
                  : undefined}
              >
                <span className="calendar-agenda-time">{entry.time ?? (entry.kind === 'event' ? 'Todo el día' : 'Sin hora')}</span>
                <div className="calendar-agenda-details">
                  <div className="calendar-agenda-title-row">
                  <span className="calendar-agenda-title">{entry.title}</span>
                  {entry.canEdit && onEdit && onDelete ? <div className="calendar-agenda-actions">
                    <button type="button" className="entry-action-button task-icon-button" aria-label={`Editar ${entry.title}`} title="Editar" disabled={busy || (entry.source === 'google-calendar' && Boolean(onAuthorizeGoogle))} onClick={() => onEdit(entry)}><img src={editTaskIcon} alt="" /></button>
                    <button type="button" className="entry-action-button task-icon-button danger-button" aria-label={`Eliminar ${entry.title}`} title="Eliminar" disabled={busy || (entry.source === 'google-calendar' && Boolean(onAuthorizeGoogle))} onClick={() => onDelete(entry)}><img src={deleteTaskIcon} alt="" /></button>
                  </div> : null}
                  </div>
                  <span className="calendar-agenda-source">{kindLabels[entry.kind]}{entry.calendarName ? ` · ${entry.calendarName}` : ''}</span>
                  {(!entry.canEdit || !onEdit || !onDelete) && entry.source === 'google-calendar' && <span className="calendar-agenda-source">Solo lectura</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
