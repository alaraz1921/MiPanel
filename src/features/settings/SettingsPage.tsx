import { useEffect, useRef, useState } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';
import { useGoogleCalendar } from '../../integrations/google/GoogleCalendarContext';
import { supabase } from '../../integrations/supabase/supabaseClient';
import { BackgroundSettings } from '../background/BackgroundSettings';
import { ConfigurationSettings } from './ConfigurationSettings';

const statusLabels = {
  connected: 'Conectado', disconnected: 'Desconectado', connecting: 'Conectando…',
  error: 'Error de conexión', unconfigured: 'No configurado en esta compilación',
};

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const microsoft = useMicrosoftTodo();
  const google = useGoogleCalendar();
  const [background, setBackground] = useLocalStorage('mipanel.backgroundImage', '');
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    let active = true;
    // Solo metadatos públicos ya disponibles: no se solicitan permisos ni tokens nuevos.
    if (supabase) {
      void supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        const identities: Record<string, string> = {};
        for (const identity of data.session?.user.identities ?? []) {
          const metadata = identity.identity_data;
          const email = metadata?.email ?? metadata?.preferred_username;
          const name = metadata?.full_name ?? metadata?.name;
          identities[identity.provider] = [name, email].filter((item) => typeof item === 'string' && item).join(' · ');
        }
        setAccounts(identities);
      }).catch(() => { /* La conexión muestra sus propios errores; los metadatos son opcionales. */ });
    } else {
      setAccounts({ azure: window.localStorage.getItem('mipanel.microsoft.accountHint') ?? '' });
    }
    return () => { active = false; };
  }, [microsoft.status, google.status]);

  return (
    <main className="settings-page">
      <header className="panel settings-page-heading">
        <div><span className="eyebrow">MiPanel</span><h1 ref={titleRef} tabIndex={-1}>Configuración</h1></div>
        <button type="button" className="ghost-button" onClick={onBack}>← Volver al panel</button>
      </header>
      <nav className="panel settings-navigation" aria-label="Apartados de configuración">
        <a href="#copias">Exportar / importar</a><a href="#fondo">Fondo</a>
        <a href="#microsoft">Microsoft</a><a href="#google">Google y calendarios</a>
      </nav>
      <ConfigurationSettings />
      <BackgroundSettings value={background} onSave={(image) => {
        // Comprobar la cuota antes de anunciar éxito o notificar a los otros componentes.
        window.localStorage.setItem('mipanel.backgroundImage', JSON.stringify(image));
        setBackground(image);
      }} />
      <section className="panel settings-section" id="microsoft" aria-labelledby="microsoft-settings-title">
        <h2 id="microsoft-settings-title">Cuenta de Microsoft</h2>
        <p role="status">{statusLabels[microsoft.status]}</p>
        {microsoft.status !== 'disconnected' && microsoft.status !== 'unconfigured' && accounts.azure && <p className="settings-account">{accounts.azure}</p>}
        <p className="settings-help">Tus listas y tareas se muestran en el panel y en el calendario unificado.</p>
        <div className="settings-account-actions">
          {microsoft.status !== 'unconfigured' && microsoft.status !== 'connecting' && microsoft.status !== 'connected' && <button type="button" className="primary-button" onClick={() => void microsoft.connect()}>Conectar Microsoft</button>}
          {microsoft.status === 'connected' && <button type="button" className="ghost-button" disabled={microsoft.busy} onClick={() => void microsoft.refresh()}>Actualizar tareas</button>}
          {['connected', 'connecting', 'error'].includes(microsoft.status) && <button type="button" className="ghost-button" onClick={() => void microsoft.disconnect()}>Desconectar Microsoft</button>}
        </div>
        {microsoft.error && <p role="alert" className="task-editor-error">{microsoft.error}</p>}
      </section>
      <section className="panel settings-section" id="google" aria-labelledby="google-settings-title">
        <h2 id="google-settings-title">Cuenta de Google y calendarios</h2>
        <p role="status">{statusLabels[google.status]}</p>
        {google.status !== 'disconnected' && google.status !== 'unconfigured' && accounts.google && <p className="settings-account">{accounts.google}</p>}
        <div className="settings-account-actions">
          {google.status !== 'unconfigured' && google.status !== 'connecting' && google.status !== 'connected' && <button type="button" className="primary-button" onClick={() => void google.connect()}>Conectar Google</button>}
          {google.status === 'connected' && !google.canWriteEvents && <button type="button" className="ghost-button" disabled={google.busy} onClick={() => void google.connect(true)}>Autorizar edición de eventos</button>}
          {['connected', 'connecting', 'error'].includes(google.status) && <button type="button" className="ghost-button" disabled={google.busy} onClick={() => void google.disconnect()}>Desconectar Google</button>}
        </div>
        {google.status === 'connected' && <p className="settings-help">{google.canWriteEvents ? 'Edición de eventos autorizada.' : 'Consulta de calendarios en modo lectura.'}</p>}
        {google.error && <p role="alert" className="task-editor-error">{google.error}</p>}
        {google.status === 'connected' && google.calendars.length > 0 && (
          <fieldset className="calendar-list-filter">
            <legend>Calendarios a mostrar</legend>
            {google.calendars.map((calendar) => <label key={calendar.id}>
              <input type="checkbox" checked={google.visibleCalendarIds.includes(calendar.id)} onChange={(event) => google.setCalendarVisible(calendar.id, event.target.checked)} />
              <span className="calendar-color" style={{ background: calendar.color }} />
              {calendar.name}{calendar.primary ? ' (principal)' : ''}
            </label>)}
          </fieldset>
        )}
        {google.status === 'connected' && google.busy && <p role="status">Actualizando calendarios…</p>}
        {google.status === 'connected' && !google.busy && google.calendars.length === 0 && <p>No hay calendarios disponibles.</p>}
      </section>
    </main>
  );
}
