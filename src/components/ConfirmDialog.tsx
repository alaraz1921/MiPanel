import { useEffect, useRef } from 'react';

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy = false,
  danger = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="confirm-dialog-content">
        <div>
          <span className="eyebrow">Confirmación</span>
          <h3 id="confirm-dialog-title">{title}</h3>
        </div>
        <p id="confirm-dialog-message">{message}</p>
        <div className="task-dialog-actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            className={`primary-button${danger ? ' destructive-button' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
