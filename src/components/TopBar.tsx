import { useEffect, useState } from 'react';
import configurationIcon from '../assets/configuration.png';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [now, setNow] = useState(new Date());

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
          aria-label="Abrir configuración"
          title="Configuración"
          onClick={onOpenSettings}
        >
          <img className="topbar-action-icon" src={configurationIcon} alt="" />
        </button>
      </div>
    </header>
  );
}
