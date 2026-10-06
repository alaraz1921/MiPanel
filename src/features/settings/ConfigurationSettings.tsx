import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { exportConfiguration, importConfiguration, MAX_CONFIGURATION_BYTES, parseConfiguration, type PanelConfiguration } from './configuration';

export function ConfigurationSettings() {
  const readVersion = useRef(0);
  const [preview, setPreview] = useState<PanelConfiguration>();
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [reading, setReading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    return () => { readVersion.current += 1; };
  }, []);

  function download() {
    setError(undefined);
    setMessage(undefined);
    try {
      const blob = new Blob([exportConfiguration()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MiPanel-configuracion-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Copia preparada para descargar.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo exportar la configuración.');
    }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const version = ++readVersion.current;
    setPreview(undefined);
    setError(undefined);
    setMessage(undefined);
    setReading(true);
    try {
      if (file.size > MAX_CONFIGURATION_BYTES) throw new Error('La copia no puede superar 16 MB.');
      const parsed = parseConfiguration(await file.text());
      if (version !== readVersion.current) return;
      setFileName(file.name);
      setPreview(parsed);
    } catch (failure) {
      if (version !== readVersion.current) return;
      setError(failure instanceof Error ? failure.message : 'No se pudo leer la copia.');
    } finally {
      if (version === readVersion.current) setReading(false);
    }
  }

  function applyImport() {
    if (!preview) return;
    setConfirming(false);
    setError(undefined);
    try {
      importConfiguration(preview);
      setPreview(undefined);
      setMessage('Configuración importada. Los cambios ya están aplicados.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo importar la configuración.');
    }
  }

  return (
    <section className="panel settings-section" id="copias" aria-labelledby="configuration-title">
      <div className="configuration-settings">
        <div>
          <span className="eyebrow">Configuración</span>
          <h2 id="configuration-title">Exportar / importar configuración</h2>
        </div>
        <p>Guarda tus accesos y su orden, iconos personalizados, fondo, lista de tareas seleccionada y calendarios visibles.</p>
        <p className="settings-help">La copia no incluye sesiones, contraseñas, tokens, tareas ni eventos. Para usar tus datos en otro equipo tendrás que conectar tus cuentas.</p>
        <button type="button" className="primary-button" onClick={download}>Exportar configuración</button>
        <label className="configuration-file">
          Importar una copia
          <input type="file" accept=".json,application/json" onChange={(event) => void selectFile(event)} />
        </label>
        {reading && <p role="status">Leyendo copia…</p>}
        {preview && (
          <section className="configuration-preview" aria-labelledby="configuration-preview-title">
            <h4 id="configuration-preview-title">Contenido de la copia</h4>
            <p className="configuration-filename">{fileName}</p>
            <dl>
              <dt>Exportada</dt><dd>{new Date(preview.exportedAt).toLocaleString('es-ES')}</dd>
              <dt>Accesos</dt><dd>{preview.settings.shortcuts.length}</dd>
              <dt>Iconos personalizados</dt><dd>{preview.settings.shortcuts.filter((shortcut) => shortcut.customIcon).length}</dd>
              <dt>Fondo</dt><dd>{preview.settings.backgroundImage ? 'Incluido' : 'Sin fondo'}</dd>
              <dt>Lista de tareas</dt><dd>{preview.settings.microsoftSelectedListId ? 'Selección incluida' : 'Predeterminada'}</dd>
              <dt>Calendarios</dt><dd>{preview.settings.googleVisibleCalendarIds.length || 'Ninguno seleccionado'}</dd>
            </dl>
            {preview.settings.backgroundImage && <img className="configuration-background" src={preview.settings.backgroundImage} alt="Fondo de la copia" />}
            {preview.settings.shortcuts.length > 0 && (
              <ul className="configuration-shortcuts" aria-label="Accesos de la copia">
                {preview.settings.shortcuts.map((shortcut) => <li key={shortcut.id}><strong>{shortcut.label}</strong><span>{shortcut.url}</span></li>)}
              </ul>
            )}
            <p>La importación sustituirá estas preferencias en este navegador. Puedes exportar primero tu configuración actual.</p>
            <button type="button" className="primary-button" onClick={() => setConfirming(true)}>Importar configuración…</button>
          </section>
        )}
        {error && <p className="task-editor-error" role="alert">{error}</p>}
        {message && <p className="configuration-success" role="status">{message}</p>}
      </div>
      {confirming && (
        <ConfirmDialog
          title="¿Sustituir la configuración actual?"
          message="Se reemplazarán los accesos, iconos, fondo y selecciones de listas y calendarios. Tus sesiones y tus tareas o eventos no se modificarán."
          confirmLabel="Sustituir e importar"
          onCancel={() => setConfirming(false)}
          onConfirm={applyImport}
        />
      )}
    </section>
  );
}
