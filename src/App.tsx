import { TopBar } from './components/TopBar';
import { CalendarView } from './features/calendar/CalendarView';
import { SearchBar } from './features/search/SearchBar';
import { Shortcuts } from './features/shortcuts/Shortcuts';
import { TaskPanel } from './features/tasks/TaskPanel';
import { useExtensionStorage } from './hooks/useExtensionStorage';

export default function App() {
  const [backgroundImage] = useExtensionStorage('mipanel.backgroundImage', '');

  return (
    <>
      {backgroundImage && (
        <div className="background-image" style={{ backgroundImage: `url("${backgroundImage}")` }} aria-hidden="true" />
      )}
      <main className="app-shell">
        <div className="hero">
          <TopBar />
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
          Versión 0.5.2 · Microsoft To Do conectado. El modo demo sigue disponible sin cuentas conectadas.
        </footer>
      </main>
    </>
  );
}
