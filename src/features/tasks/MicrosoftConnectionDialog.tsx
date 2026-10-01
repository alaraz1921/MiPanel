import { useEffect, useState, type FormEvent } from 'react';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';

type MicrosoftConnectionDialogProps = {
  open: boolean;
  onClose: () => void;
};

const ENTRA_APPLICATIONS_URL = 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade';

export function MicrosoftConnectionDialog({ open, onClose }: MicrosoftConnectionDialogProps) {
  const microsoft = useMicrosoftTodo();
  const [clientId, setClientId] = useState('');
  const [tenant, setTenant] = useState('common');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [copyLabel, setCopyLabel] = useState('Copiar');

  useEffect(() => {
    if (!open) return;
    setClientId(microsoft.configuration?.clientId ?? '');
    setTenant(microsoft.configuration?.tenant ?? 'common');
    setFormError(undefined);
    setCopyLabel('Copiar');
  }, [microsoft.configuration, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open, submitting]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(undefined);
    try {
      const saved = await microsoft.saveConfiguration({ clientId, tenant });
      const connected = await microsoft.connect(saved);
      if (connected) onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la configuración.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRedirect() {
    if (!microsoft.redirectUri) return;
    try {
      await navigator.clipboard.writeText(microsoft.redirectUri);
      setCopyLabel('Copiado');
    } catch {
      setCopyLabel('Selecciona y copia');
    }
  }

  async function forgetConfiguration() {
    setSubmitting(true);
    setFormError(undefined);
    try {
      await microsoft.removeConfiguration();
      onClose();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo eliminar la configuración.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="microsoft-dialog-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Integración de solo lectura</span>
            <h2 id="microsoft-dialog-title">Conectar Microsoft To Do</h2>
          </div>
          <button type="button" className="dialog-close" aria-label="Cerrar" disabled={submitting} onClick={onClose}>×</button>
        </div>

        <p className="dialog-intro">
          MiPanel necesita un registro de aplicación gratuito en Microsoft Entra. Solo se guarda el Client ID público;
          nunca introduzcas un client secret, contraseña o token.
        </p>

        <ol className="connection-steps">
          <li>
            Abre <a href={ENTRA_APPLICATIONS_URL} target="_blank" rel="noreferrer">Registros de aplicaciones de Microsoft Entra</a> y crea una aplicación.
          </li>
          <li>Añade una plataforma <strong>Aplicación de página única (SPA)</strong> con el redirect mostrado abajo.</li>
          <li>En permisos delegados de Microsoft Graph añade únicamente <strong>Tasks.Read</strong>.</li>
          <li>Copia el identificador de aplicación (Client ID), introdúcelo y conecta la cuenta.</li>
        </ol>

        <div className="redirect-field">
          <label htmlFor="microsoft-redirect">Redirect de esta instalación</label>
          <div className="copy-row">
            <input id="microsoft-redirect" value={microsoft.redirectUri ?? 'Carga MiPanel como extensión para obtenerlo'} readOnly />
            <button type="button" className="ghost-button" disabled={!microsoft.redirectUri} onClick={() => void copyRedirect()}>{copyLabel}</button>
          </div>
          <small>El ID y el redirect pueden ser distintos en Chrome, Brave y Edge.</small>
        </div>

        <form className="connection-form" onSubmit={submit}>
          <label htmlFor="microsoft-client-id">Client ID público</label>
          <input
            id="microsoft-client-id"
            value={clientId}
            required
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="00000000-0000-0000-0000-000000000000"
            onChange={(event) => setClientId(event.target.value)}
          />

          <label htmlFor="microsoft-tenant">Tenant</label>
          <input
            id="microsoft-tenant"
            value={tenant}
            required
            autoComplete="off"
            spellCheck={false}
            list="microsoft-tenant-options"
            onChange={(event) => setTenant(event.target.value)}
          />
          <datalist id="microsoft-tenant-options">
            <option value="common" />
            <option value="organizations" />
            <option value="consumers" />
          </datalist>

          {(formError || microsoft.error) && (
            <p className="dialog-error" role="alert">{formError ?? microsoft.error}</p>
          )}

          <div className="dialog-actions">
            {microsoft.configuration && (
              <button type="button" className="text-button danger-text" disabled={submitting} onClick={() => void forgetConfiguration()}>
                Olvidar configuración
              </button>
            )}
            <span className="dialog-action-spacer" />
            <button type="button" className="ghost-button" disabled={submitting} onClick={onClose}>Cancelar</button>
            <button type="submit" className="primary-button" disabled={submitting || !microsoft.redirectUri}>
              {submitting ? 'Conectando…' : 'Guardar y conectar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
