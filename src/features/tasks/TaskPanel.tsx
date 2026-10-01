import { useMemo } from 'react';
import { initialTasks } from '../../data/mock';
import { useExtensionStorage } from '../../hooks/useExtensionStorage';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';
import { dayLabel, toDateKey } from '../../lib/date';
import type { TaskItem } from '../../types';

export function TaskPanel() {
  const [demoTasks, setDemoTasks] = useExtensionStorage<TaskItem[]>('mipanel.mockTasks', initialTasks);
  const microsoft = useMicrosoftTodo();
  const usingMicrosoft = microsoft.status === 'connected';
  const tasks = usingMicrosoft ? microsoft.tasks : demoTasks;
  const today = toDateKey(new Date());

  const visible = useMemo(
    () => tasks.filter((task) => !task.completed).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [tasks],
  );

  function toggle(id: string) {
    if (usingMicrosoft) return;
    setDemoTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed } : task));
  }

  function resetMocks() {
    setDemoTasks(initialTasks);
  }

  const statusLabel = {
    unconfigured: 'Sin configurar',
    disconnected: 'Desconectado',
    connecting: 'Conectando…',
    connected: 'Solo lectura',
    error: 'Error',
  }[microsoft.status];

  return (
    <section className="panel tasks-panel" aria-labelledby="tasks-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Microsoft To Do</span>
          <h2 id="tasks-title">Próximas tareas</h2>
        </div>
        <span className={`status-pill status-${microsoft.status}`} aria-live="polite">
          {usingMicrosoft ? statusLabel : `Datos demo · ${statusLabel}`}
        </span>
      </div>

      <div className="task-list">
        {visible.length === 0 && (
          <p className="empty-state">No hay tareas pendientes para mostrar.</p>
        )}
        {visible.map((task) => (
          <label className="task-row" key={task.id}>
            <input
              type="checkbox"
              checked={task.completed}
              disabled={usingMicrosoft}
              aria-label={usingMicrosoft ? `${task.title}, solo lectura` : task.title}
              onChange={() => toggle(task.id)}
            />
            <span className="task-body">
              <span className="task-title">{task.important ? '★ ' : ''}{task.title}</span>
              <span className="task-meta">
                {task.listName}
                {task.dueDate && <> · 📅 {task.dueDate === today ? 'hoy' : dayLabel(task.dueDate)}</>}
                {task.reminderDateTime && <> · 🔔 {task.reminderDateTime.slice(11, 16)}</>}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="panel-footer">
        <span>
          {usingMicrosoft
            ? `${visible.length} tareas pendientes obtenidas de Microsoft To Do.`
            : microsoft.error ?? (microsoft.status === 'unconfigured'
              ? 'Configura el Client ID público para habilitar Microsoft To Do.'
              : 'Conecta Microsoft para sustituir temporalmente los datos demo.')}
        </span>
        <div className="panel-actions">
          {microsoft.status === 'connected' && (
            <>
              <button type="button" className="text-button" disabled={microsoft.busy} onClick={() => void microsoft.refresh()}>
                {microsoft.busy ? 'Actualizando…' : 'Actualizar'}
              </button>
              <button type="button" className="text-button" onClick={() => void microsoft.disconnect()}>Desconectar</button>
            </>
          )}
          {(microsoft.status === 'disconnected' || microsoft.status === 'error') && (
            <button type="button" className="text-button" disabled={microsoft.busy} onClick={() => void microsoft.connect()}>
              {microsoft.busy ? 'Conectando…' : 'Conectar Microsoft'}
            </button>
          )}
          {!usingMicrosoft && (
            <button type="button" className="text-button" onClick={resetMocks}>Restaurar demo</button>
          )}
        </div>
      </div>
    </section>
  );
}
