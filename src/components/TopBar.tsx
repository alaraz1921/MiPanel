import { useEffect, useState } from 'react';

export function TopBar() {
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
      <div className="brand-chip">MiPanel · nueva pestaña</div>
    </header>
  );
}
