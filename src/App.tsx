import { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { SettingsPage } from './features/settings/SettingsPage';
import { CalendarView } from './features/calendar/CalendarView';
import { SearchBar } from './features/search/SearchBar';
import { Shortcuts } from './features/shortcuts/Shortcuts';
import { TaskPanel } from './features/tasks/TaskPanel';
import { useLocalStorage } from './hooks/useLocalStorage';

export default function App() {
  const [backgroundImage] = useLocalStorage('mipanel.backgroundImage', '');
  const [settingsOpen, setSettingsOpen] = useState(() => new URLSearchParams(window.location.search).get('view') === 'settings');

  useEffect(() => {
    const onPopState = () => setSettingsOpen(new URLSearchParams(window.location.search).get('view') === 'settings');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigate(settings: boolean) {
    const url = new URL(window.location.href);
    if (settings) url.searchParams.set('view', 'settings');
    else url.searchParams.delete('view');
    url.hash = '';
    window.history.pushState(null, '', url);
    setSettingsOpen(settings);
    window.scrollTo(0, 0);
  }

  return (
    <>
      {backgroundImage && (
        <div className="background-image" style={{ backgroundImage: `url("${backgroundImage}")` }} aria-hidden="true" />
      )}
      {settingsOpen && <SettingsPage onBack={() => navigate(false)} />}
      {/* Mantener los consumidores montados conserva el mes y evita nuevas lecturas al volver. */}
      <main className="app-shell" hidden={settingsOpen}>
        <div className="hero">
          <TopBar onOpenSettings={() => navigate(true)} />
          <Shortcuts />
          <div className="search-center">
            <SearchBar />
          </div>
        </div>

        <div className="content-grid">
          <TaskPanel />
          <CalendarView />
        </div>

        <footer className="footer-note">
          Versión 0.6.0 · Conecta Microsoft To Do para cargar tus tareas.
        </footer>
      </main>
    </>
  );
}
