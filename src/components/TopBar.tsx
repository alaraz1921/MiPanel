import { useEffect, useState } from 'react';
import configurationIcon from '../assets/configuration.png';
import backgroundIcon from '../assets/background.png';
import { BackgroundSettings } from '../features/background/BackgroundSettings';
import { ConfigurationSettings } from '../features/settings/ConfigurationSettings';
import { useLocalStorage } from '../hooks/useLocalStorage';

export function TopBar() {
  const [now, setNow] = useState(new Date());
  const [backgroundImage, setBackgroundImage] = useLocalStorage('mipanel.backgroundImage', '');
  const [editingBackground, setEditingBackground] = useState(false);
  const [editingConfiguration, setEditingConfiguration] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  const date = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  return (
    <header className="topbar">
      <div>
        <div className="clock">{time}</div>
        <div className="date-label">{date}</div>
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          className="background-button"
          aria-label="Configuración: importar o exportar"
          title="Importar o exportar configuración"
          onClick={() => setEditingConfiguration(true)}
        >
          <img className="topbar-action-icon" src={configurationIcon} alt="" />
        </button>
        <button
          type="button"
          className="background-button"
          aria-label="Cambiar fondo"
          title="Cambiar fondo"
          onClick={() => setEditingBackground(true)}
        >
          <img className="topbar-action-icon" src={backgroundIcon} alt="" />
        </button>
      </div>
      {editingConfiguration && <ConfigurationSettings onClose={() => setEditingConfiguration(false)} />}
      {editingBackground && (
        <BackgroundSettings
          value={backgroundImage}
          onCancel={() => setEditingBackground(false)}
          onSave={(value) => {
            setBackgroundImage(value);
            setEditingBackground(false);
          }}
        />
      )}
    </header>
  );
}
