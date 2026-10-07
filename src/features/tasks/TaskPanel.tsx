import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useMicrosoftTodo } from '../../integrations/microsoft/MicrosoftTodoContext';
import { dayLabel, toDateKey } from '../../lib/date';
import type { TaskItem } from '../../types';
import { TaskEditorDialog } from './TaskEditorDialog';
import editTaskIcon from '../../assets/edit-task.png';
import deleteTaskIcon from '../../assets/delete-task.png';

type PendingConfirmation = {
  task: TaskItem;
};

function isOverdue(task: TaskItem, today: string, now: number) {
  const dueDateOverdue = Boolean(task.dueDate && task.dueDate < today);
  const reminderOverdue = Boolean(
    task.reminderDateTime && new Date(task.reminderDateTime).getTime() < now,
  );
  return dueDateOverdue || reminderOverdue;
}

function taskScheduleKey(task: TaskItem) {
  return task.reminderDateTime ?? task.dueDate ?? '9999-12-31T23:59:59';
}

export function TaskPanel() {
  const [selectedListId, setSelectedListId] = useLocalStorage('mipanel.microsoft.selectedListId', '');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showOverdue, setShowOverdue] = useState(false);
  const [editor, setEditor] = useState<TaskItem | 'new' | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const microsoft = useMicrosoftTodo();
  const usingMicrosoft = microsoft.status === 'connected';
  const activeListId = microsoft.lists.some((list) => list.id === selectedListId)
    ? selectedListId
    : (microsoft.lists[0]?.id ?? '');
  const activeList = microsoft.lists.find((list) => list.id === activeListId);
  const tasks = usingMicrosoft
    ? microsoft.tasks.filter((task) => task.listId === activeListId)
    : [];
  const today = toDateKey(new Date());
  const now = Date.now();

  const visible = useMemo(
    () => tasks
      .filter((task) => showCompleted || !task.completed)
      .filter((task) => !showOverdue || isOverdue(task, today, now))
      .sort((a, b) => Number(a.completed) - Number(b.completed)
        || taskScheduleKey(a).localeCompare(taskScheduleKey(b))
        || a.title.localeCompare(b.title)),
    [now, showCompleted, showOverdue, tasks, today],
  );

  function requestToggle(task: TaskItem) {
    void microsoft.toggleTask(task);
  }

  async function saveEditor(fields: Parameters<typeof microsoft.createTask>[1]) {
    if (editor === 'new') return microsoft.createTask(activeListId, fields);
    if (editor) return microsoft.updateTask(editor, fields);
    return false;
  }

  async function confirmPendingAction() {
    if (!confirmation) return;
    if (await microsoft.deleteTask(confirmation.task)) setConfirmation(null);
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
        <div className="task-panel-header-actions">
          {microsoft.status === 'connected' && (
            <button
              type="button"
              className="status-pill status-connected status-action"
              disabled={microsoft.busy}
              onClick={() => void microsoft.refresh()}
            >
              {microsoft.busy ? 'Actualizando…' : 'Actualizar'}
            </button>
          )}
          {microsoft.status !== 'connected' && <span className={`status-pill status-${microsoft.status}`} aria-live="polite">
            {statusLabel}
          </span>}
        </div>
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
          <div className="task-filter-options">
            <label className="completed-filter">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(event) => setShowCompleted(event.target.checked)}
              />
              Mostrar completadas
            </label>
            <label className="completed-filter">
              <input
                type="checkbox"
                checked={showOverdue}
                onChange={(event) => setShowOverdue(event.target.checked)}
              />
              Solo vencidas
            </label>
          </div>
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
          <div className={`task-row${task.completed ? ' completed' : ''}`} key={`${task.listId}:${task.id}`}>
            <div className="task-check">
              <input
                type="checkbox"
                checked={task.completed}
                disabled={usingMicrosoft && microsoft.updatingTaskIds.includes(`${task.listId}:${task.id}`)}
                aria-label={task.completed ? `Reabrir ${task.title}` : `Completar ${task.title}`}
                onChange={() => requestToggle(task)}
              />
              <span className="task-body">
                <button
                  type="button"
                  className="task-title task-title-toggle"
                  disabled={microsoft.updatingTaskIds.includes(`${task.listId}:${task.id}`)}
                  aria-label={task.completed ? `Reabrir ${task.title}` : `Completar ${task.title}`}
                  onClick={() => requestToggle(task)}
                >{task.important ? '★ ' : ''}{task.title}</button>
                <span className="task-meta">
                  {task.listName}
                  {task.dueDate && <> · 📅 {task.dueDate === today ? 'hoy' : dayLabel(task.dueDate)}</>}
                  {task.reminderDateTime && <> · 🔔 {task.reminderDateTime.slice(11, 16)}</>}
                </span>
              </span>
            </div>
            {usingMicrosoft && (
              <div className="task-actions">
                <button
                  type="button"
                  className="entry-action-button task-icon-button"
                  aria-label={`Editar ${task.title}`}
                  title="Editar tarea"
                  disabled={microsoft.updatingTaskIds.includes(`${task.listId}:${task.id}`)}
                  onClick={() => setEditor(task)}
                >
                  <img src={editTaskIcon} alt="" />
                </button>
                <button
                  type="button"
                  className="entry-action-button task-icon-button danger-button"
                  aria-label={`Eliminar ${task.title}`}
                  title="Eliminar tarea"
                  disabled={microsoft.updatingTaskIds.includes(`${task.listId}:${task.id}`)}
                  onClick={() => setConfirmation({ task })}
                >
                  <img src={deleteTaskIcon} alt="" />
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
            : microsoft.error ?? (microsoft.status === 'connecting'
              ? 'Conectando con Microsoft…'
              : 'Conecta Microsoft para cargar tus tareas.')}
        </span>
        <div className="panel-actions">
          {microsoft.status !== 'unconfigured' && microsoft.status !== 'disconnected' && (
            <button type="button" className="text-button" onClick={() => void microsoft.disconnect()}>Desconectar</button>
          )}
          {(microsoft.status === 'unconfigured' || microsoft.status === 'disconnected' || microsoft.status === 'error') && (
            <button type="button" className="text-button" disabled={microsoft.busy} onClick={() => void microsoft.connect()}>
              {microsoft.busy ? 'Conectando…' : 'Conectar Microsoft'}
            </button>
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

      {confirmation && (
        <ConfirmDialog
          key={`${confirmation.task.listId}:${confirmation.task.id}`}
          title="Eliminar tarea"
          message={`¿Quieres eliminar “${confirmation.task.title}” de Microsoft To Do? Esta acción no se puede deshacer.${microsoft.error ? ` ${microsoft.error}` : ''}`}
          confirmLabel="Eliminar tarea"
          danger
          busy={usingMicrosoft && microsoft.updatingTaskIds.includes(`${confirmation.task.listId}:${confirmation.task.id}`)}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirmPendingAction()}
        />
      )}
    </section>
  );
}
