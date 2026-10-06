import { useEffect, useRef } from 'react';
import { dayLabel } from '../../lib/date';
import type { CalendarEntry } from '../../types';

type CalendarDayDialogProps = {
  date: string;
  entries: CalendarEntry[];
  onClose: () => void;
};

const kindLabels = { event: 'Evento', due: 'Vencimiento', reminder: 'Recordatorio' };

export function CalendarDayDialog({ date, entries, onClose }: CalendarDayDialogProps) {
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
          <button type="button" className="ghost-button" onClick={onClose} autoFocus>Cerrar</button>
        </div>
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
                  <span className="calendar-agenda-title">{entry.title}</span>
                  <span className="calendar-agenda-source">{kindLabels[entry.kind]}{entry.calendarName ? ` · ${entry.calendarName}` : ''}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
