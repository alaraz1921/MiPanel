import { useMemo, useState } from 'react';
import { initialTasks } from '../../data/mock';
import { useExtensionStorage } from '../../hooks/useExtensionStorage';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';
import { dayLabel, toDateKey } from '../../lib/date';
import type { TaskItem } from '../../types';
import { TaskEditorDialog } from './TaskEditorDialog';

export function TaskPanel() {
  const [demoTasks, setDemoTasks] = useExtensionStorage<TaskItem[]>('mipanel.mockTasks', initialTasks);
  const [selectedListId, setSelectedListId] = useExtensionStorage('mipanel.microsoft.selectedListId', '');
  const [showCompleted, setShowCompleted] = useState(false);
  const [editor, setEditor] = useState<TaskItem | 'new' | null>(null);
  const microsoft = useMicrosoftTodo();
  const usingMicrosoft = microsoft.status === 'connected';
  const activeListId = microsoft.lists.some((list) => list.id === selectedListId)
    ? selectedListId
    : (microsoft.lists[0]?.id ?? '');
  const activeList = microsoft.lists.find((list) => list.id === activeListId);
  const tasks = usingMicrosoft
    ? microsoft.tasks.filter((task) => task.listId === activeListId)
    : demoTasks;
  const today = toDateKey(new Date());

  const visible = useMemo(
    () => tasks
      .filter((task) => showCompleted || !task.completed)
      .sort((a, b) => Number(a.completed) - Number(b.completed)
        || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
    [showCompleted, tasks],
  );

  function toggle(task: TaskItem) {
    if (usingMicrosoft) {
      void microsoft.toggleTask(task);
      return;
    }
    setDemoTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: !item.completed } : item));
  }

  function resetMocks() {
    setDemoTasks(initialTasks);
  }

  async function saveEditor(fields: Parameters<typeof microsoft.createTask>[1]) {
    if (editor === 'new') return microsoft.createTask(activeListId, fields);
    if (editor) return microsoft.updateTask(editor, fields);
    return false;
  }

  async function remove(task: TaskItem) {
    const confirmed = window.confirm(`¿Eliminar “${task.title}” de Microsoft To Do? Esta acción no se puede deshacer.`);
    if (confirmed) await microsoft.deleteTask(task);
  }

  const statusLabel = {
    unconfigured: 'Sin configurar',
    disconnected: 'Desconectado',
    connecting: 'Conectando…',
    connected: 'Conectado',
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

      {usingMicrosoft && (
        <div className="task-filters">
          <label className="task-list-filter">
            <span>Lista de tareas</span>
            <select
              value={activeListId}
              disabled={microsoft.busy || microsoft.lists.length === 0}
              onChange={(event) => setSelectedListId(event.target.value)}
            >
              {microsoft.lists.length === 0 && <option value="">Sin listas disponibles</option>}
              {microsoft.lists.map((list) => (
                <option key={list.id} value={list.id}>{list.name}</option>
              ))}
            </select>
          </label>
          <label className="completed-filter">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(event) => setShowCompleted(event.target.checked)}
            />
            Mostrar completadas
          </label>
          <button
            type="button"
            className="primary-button new-task-button"
            disabled={!activeListId || microsoft.creatingTask}
            onClick={() => setEditor('new')}
          >
            + Nueva tarea
          </button>
        </div>
      )}

      <div className="task-list">
        {visible.length === 0 && (
          <p className="empty-state">No hay tareas pendientes para mostrar.</p>
        )}
        {visible.map((task) => (
          <div className={`task-row${task.completed ? ' completed' : ''}`} key={`${task.listId ?? 'demo'}:${task.id}`}>
            <label className="task-check">
              <input
                type="checkbox"
                checked={task.completed}
                disabled={usingMicrosoft && microsoft.updatingTaskIds.includes(`${task.listId}:${task.id}`)}
                aria-label={task.completed ? `Reabrir ${task.title}` : `Completar ${task.title}`}
                onChange={() => toggle(task)}
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
            {usingMicrosoft && (
              <div className="task-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={microsoft.updatingTaskIds.includes(`${task.listId}:${task.id}`)}
                  onClick={() => setEditor(task)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="text-button danger-button"
                  disabled={microsoft.updatingTaskIds.includes(`${task.listId}:${task.id}`)}
                  onClick={() => void remove(task)}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="panel-footer">
        <span>
          {usingMicrosoft
            ? microsoft.error ?? `${visible.filter((task) => !task.completed).length} tareas pendientes en ${activeList?.name ?? 'la lista seleccionada'}. El calendario incluye todas las listas.`
            : microsoft.error ?? 'Conecta Microsoft para sustituir temporalmente los datos demo.'}
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
          {(microsoft.status === 'unconfigured' || microsoft.status === 'disconnected' || microsoft.status === 'error') && (
            <button type="button" className="text-button" disabled={microsoft.busy} onClick={() => void microsoft.connect()}>
              {microsoft.busy ? 'Conectando…' : 'Conectar Microsoft'}
            </button>
          )}
          {!usingMicrosoft && (
            <button type="button" className="text-button" onClick={resetMocks}>Restaurar demo</button>
          )}
        </div>
      </div>

      {usingMicrosoft && editor && (
        <TaskEditorDialog
          key={editor === 'new' ? `new:${activeListId}` : `${editor.listId}:${editor.id}`}
          task={editor === 'new' ? undefined : editor}
          listName={editor === 'new' ? (activeList?.name ?? 'Microsoft To Do') : editor.listName}
          busy={editor === 'new'
            ? microsoft.creatingTask
            : microsoft.updatingTaskIds.includes(`${editor.listId}:${editor.id}`)}
          error={microsoft.error}
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}
    </section>
  );
}
