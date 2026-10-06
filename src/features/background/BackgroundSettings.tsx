import { useEffect, useState, type ChangeEvent } from 'react';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type BackgroundSettingsProps = {
  value: string;
  onSave: (value: string) => void;
};

export function BackgroundSettings({ value, onSave }: BackgroundSettingsProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function save(image: string) {
    try {
      onSave(image);
      setDraft(image);
      setError(undefined);
      setMessage('Fondo actualizado.');
    } catch {
      setMessage(undefined);
      setError('No se pudo guardar el fondo. Comprueba el espacio disponible en este navegador.');
    }
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setMessage(undefined);
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
    <section className="panel settings-section" id="fondo" aria-labelledby="background-dialog-title">
      <div className="background-settings">
        <div>
          <span className="eyebrow">Personalización</span>
          <h2 id="background-dialog-title">Fondo de la página</h2>
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
        {message && <p role="status">{message}</p>}

        <div className="task-dialog-actions background-dialog-actions">
          {value && (
            <button type="button" className="ghost-button danger-button" onClick={() => save('')}>
              Quitar fondo
            </button>
          )}
          <span className="dialog-action-spacer" />
          <button type="button" className="ghost-button" onClick={() => { setDraft(value); setError(undefined); setMessage(undefined); }}>Descartar cambios</button>
          <button type="button" className="primary-button" onClick={() => save(draft)}>Guardar fondo</button>
        </div>
      </div>
    </section>
  );
}
