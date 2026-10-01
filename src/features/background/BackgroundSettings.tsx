import { useEffect, useRef, useState, type ChangeEvent } from 'react';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type BackgroundSettingsProps = {
  value: string;
  onCancel: () => void;
  onSave: (value: string) => void;
};

export function BackgroundSettings({ value, onCancel, onSave }: BackgroundSettingsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('La imagen no puede superar 4 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setError('No se pudo leer la imagen seleccionada.');
        return;
      }
      setDraft(reader.result);
      setError(undefined);
    };
    reader.onerror = () => setError('No se pudo leer la imagen seleccionada.');
    reader.readAsDataURL(file);
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="background-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="background-settings">
        <div>
          <span className="eyebrow">Personalización</span>
          <h3 id="background-dialog-title">Imagen de fondo</h3>
        </div>

        <div
          className="background-preview"
          style={draft ? { backgroundImage: `url("${draft}")` } : undefined}
          aria-label={draft ? 'Vista previa del fondo seleccionado' : 'Sin imagen de fondo'}
        >
          {!draft && <span>Sin imagen</span>}
        </div>

        <label className="background-file-button">
          <span>Seleccionar imagen</span>
          <input type="file" accept="image/*" onChange={selectImage} />
        </label>
        <p className="settings-help">La imagen se guarda únicamente en este navegador. Tamaño máximo: 4 MB.</p>
        {error && <p className="task-editor-error" role="alert">{error}</p>}

        <div className="task-dialog-actions background-dialog-actions">
          {value && (
            <button type="button" className="ghost-button danger-button" onClick={() => onSave('')}>
              Quitar fondo
            </button>
          )}
          <span className="dialog-action-spacer" />
          <button type="button" className="ghost-button" onClick={onCancel}>Cancelar</button>
          <button type="button" className="primary-button" onClick={() => onSave(draft)}>Guardar</button>
        </div>
      </div>
    </dialog>
  );
}
