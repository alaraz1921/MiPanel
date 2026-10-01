import { TopBar } from './components/TopBar';
import { CalendarView } from './features/calendar/CalendarView';
import { SearchBar } from './features/search/SearchBar';
import { Shortcuts } from './features/shortcuts/Shortcuts';
import { TaskPanel } from './features/tasks/TaskPanel';

export default function App() {
  return (
    <main className="app-shell">
      <div className="hero">
        <TopBar />
        <div className="hero-center">
          <p className="hero-kicker">Tu espacio personal</p>
          <h1>Todo lo importante, al abrir una pestaña.</h1>
          <SearchBar />
        </div>
        <Shortcuts />
      </div>

      <div className="content-grid">
        <TaskPanel />
        <CalendarView />
      </div>

      <footer className="footer-note">
        Versión 0.2.3 · Microsoft To Do en lectura opcional. El modo demo sigue disponible sin cuentas conectadas.
      </footer>
    </main>
  );
}
