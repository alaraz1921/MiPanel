import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaskFields, TaskItem } from '../../types';

type TaskEditorDialogProps = {
  task?: TaskItem;
  listName: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (fields: TaskFields) => Promise<boolean>;
};

export function TaskEditorDialog({ task, listName, busy, error, onCancel, onSave }: TaskEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState(task?.dueDate ?? task?.reminderDateTime?.slice(0, 10) ?? '');
  const [time, setTime] = useState(task?.reminderDateTime?.slice(11, 16) ?? '');
  const [important, setImportant] = useState(task?.important ?? false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const saved = await onSave({
      title,
      dueDate: date || undefined,
      reminderDateTime: date && time ? `${date}T${time}` : undefined,
      important,
    });
    if (saved) onCancel();
    else setSaveFailed(true);
  }

  return (
    <dialog
      ref={dialogRef}
      className="task-dialog"
      aria-labelledby="task-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form className="task-editor" onSubmit={(event) => void submit(event)}>
        <div>
          <span className="eyebrow">{listName}</span>
          <h3 id="task-dialog-title">{task ? 'Editar tarea' : 'Nueva tarea'}</h3>
        </div>

        <label>
          <span>Título</span>
          <input
            type="text"
            autoFocus
            required
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <div className="task-editor-dates">
          <label>
            <span>Fecha</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>Hora</span>
            <input
              type="time"
              value={time}
              disabled={!date}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
        </div>

        <label className="task-editor-important">
          <input
            type="checkbox"
            checked={important}
            onChange={(event) => setImportant(event.target.checked)}
          />
          Marcar como importante
        </label>

        {saveFailed && error && <p className="task-editor-error" role="alert">{error}</p>}

        <div className="task-dialog-actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={busy || !title.trim()}>
            {busy ? 'Guardando…' : task ? 'Guardar cambios' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
