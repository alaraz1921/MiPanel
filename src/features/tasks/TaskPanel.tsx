import { useMemo } from 'react';
import { initialTasks } from '../../data/mock';
import { useExtensionStorage } from '../../hooks/useExtensionStorage';
import { dayLabel, toDateKey } from '../../lib/date';
import type { TaskItem } from '../../types';

export function TaskPanel() {
  const [tasks, setTasks] = useExtensionStorage<TaskItem[]>('mipanel.mockTasks', initialTasks);
  const today = toDateKey(new Date());

  const visible = useMemo(
    () => tasks.filter((task) => !task.completed).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [tasks],
  );

  function toggle(id: string) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed } : task));
  }

  function resetMocks() {
    setTasks(initialTasks);
  }

  return (
    <section className="panel tasks-panel" aria-labelledby="tasks-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Microsoft To Do</span>
          <h2 id="tasks-title">Próximas tareas</h2>
        </div>
        <span className="status-pill">Datos demo</span>
      </div>

      <div className="task-list">
        {visible.map((task) => (
          <label className="task-row" key={task.id}>
            <input type="checkbox" checked={task.completed} onChange={() => toggle(task.id)} />
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
        <span>La fase Microsoft sustituirá estos datos por tu To Do real.</span>
        <button type="button" className="text-button" onClick={resetMocks}>Restaurar demo</button>
      </div>
    </section>
  );
}
