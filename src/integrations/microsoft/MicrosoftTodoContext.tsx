import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { TaskFields, TaskItem, TaskList } from '../../types';
import {
  clearMicrosoftSession,
  connectMicrosoft,
  isMicrosoftConfigured,
  readMicrosoftSession,
  type MicrosoftTokenSession,
} from './microsoftAuth';
import {
  createMicrosoftTodoTask,
  deleteMicrosoftTodoTask,
  fetchMicrosoftTodoSnapshot,
  MicrosoftGraphError,
  updateMicrosoftTodoTask,
  updateMicrosoftTodoTaskStatus,
} from './microsoftGraph';
import {
  clearMicrosoftTodoCache,
  readMicrosoftTodoCache,
  writeMicrosoftTodoCache,
} from './microsoftCache';
import { isSupabaseConfigured } from '../supabase/supabaseClient';

export type MicrosoftConnectionStatus =
  | 'unconfigured'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

type MicrosoftTodoContextValue = {
  status: MicrosoftConnectionStatus;
  busy: boolean;
  lists: TaskList[];
  tasks: TaskItem[];
  creatingTask: boolean;
  updatingTaskIds: string[];
  error?: string;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  toggleTask: (task: TaskItem) => Promise<boolean>;
  createTask: (listId: string, fields: TaskFields) => Promise<boolean>;
  updateTask: (task: TaskItem, fields: TaskFields) => Promise<boolean>;
  deleteTask: (task: TaskItem) => Promise<boolean>;
};

const MicrosoftTodoContext = createContext<MicrosoftTodoContextValue | undefined>(undefined);

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Se produjo un error inesperado al conectar con Microsoft.';
}

export function MicrosoftTodoProvider({ children }: PropsWithChildren) {
  const configured = isMicrosoftConfigured();
  const [status, setStatus] = useState<MicrosoftConnectionStatus>(configured ? 'connecting' : 'unconfigured');
  const [busy, setBusy] = useState(configured);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [creatingTask, setCreatingTask] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const listsRef = useRef<TaskList[]>([]);
  const tasksRef = useRef<TaskItem[]>([]);
  const requestVersion = useRef(0);

  function applySnapshot(nextLists: TaskList[], nextTasks: TaskItem[], cache = true) {
    listsRef.current = nextLists;
    tasksRef.current = nextTasks;
    setLists(nextLists);
    setTasks(nextTasks);
    if (cache) {
      void writeMicrosoftTodoCache({ lists: nextLists, tasks: nextTasks }).catch(() => undefined);
    }
  }

  async function clearRemoteState() {
    applySnapshot([], [], false);
    await clearMicrosoftTodoCache();
  }

  function replaceTask(nextTask: TaskItem) {
    const nextTasks = tasksRef.current.map((task) => (
      task.id === nextTask.id && task.listId === nextTask.listId ? nextTask : task
    ));
    applySnapshot(listsRef.current, nextTasks);
  }

  function removeTask(taskToRemove: TaskItem) {
    const nextTasks = tasksRef.current.filter((task) => (
      task.id !== taskToRemove.id || task.listId !== taskToRemove.listId
    ));
    applySnapshot(listsRef.current, nextTasks);
  }

  async function handleMutationError(mutationError: unknown) {
    if (mutationError instanceof MicrosoftGraphError && mutationError.status === 401) {
      await clearMicrosoftSession();
      await clearRemoteState();
      setStatus('disconnected');
      setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
    } else if (mutationError instanceof MicrosoftGraphError && mutationError.status === 403) {
      setError('Microsoft no ha concedido Tasks.ReadWrite a esta sesión. Desconecta y vuelve a conectar para aceptar el permiso.');
    } else {
      setError(readableError(mutationError));
    }
  }

  async function activeSession() {
    const session = await readMicrosoftSession();
    if (session) return session;
    setStatus('disconnected');
    await clearRemoteState();
    setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
    return undefined;
  }

  async function loadTasks(session: MicrosoftTokenSession, keepConnected = false) {
    const version = ++requestVersion.current;
    setBusy(true);
    if (!keepConnected) setStatus('connecting');
    setError(undefined);

    try {
      const snapshot = await fetchMicrosoftTodoSnapshot(session.accessToken);
      if (version !== requestVersion.current) return false;
      applySnapshot(snapshot.lists, snapshot.tasks);
      setStatus('connected');
      return true;
    } catch (loadError) {
      if (version !== requestVersion.current) return false;
      if (loadError instanceof MicrosoftGraphError && loadError.status === 401) {
        if (isSupabaseConfigured()) {
          setStatus('error');
          setError('Azure autenticó la cuenta, pero el token no permite acceder a Microsoft Graph. Revisa Tasks.ReadWrite en Entra y vuelve a conectar.');
        } else {
          await clearMicrosoftSession();
          await clearRemoteState();
          setStatus('disconnected');
          setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
        }
      } else {
        setStatus('error');
        setError(readableError(loadError));
      }
      return false;
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!configured) return;
    const version = ++requestVersion.current;

    void readMicrosoftSession()
      .then(async (session) => {
        if (version !== requestVersion.current) return;
        if (!session) {
          setStatus('disconnected');
          setBusy(false);
          return;
        }
        const cached = await readMicrosoftTodoCache();
        if (version !== requestVersion.current) return;
        if (cached) {
          applySnapshot(cached.lists, cached.tasks, false);
          setStatus('connected');
          setBusy(false);
          return;
        }
        await loadTasks(session);
      })
      .catch((sessionError) => {
        if (version !== requestVersion.current) return;
        setStatus('error');
        setError(readableError(sessionError));
        setBusy(false);
      });

    return () => {
      requestVersion.current += 1;
    };
  }, [configured]);

  async function connect() {
    setStatus('connecting');
    setBusy(true);
    setError(undefined);
    try {
      const session = await connectMicrosoft();
      if (!session) {
        // Supabase Auth continúa el inicio de sesión mediante redirección. La
        // página se recargará y restaurará la sesión al volver del proveedor.
        setBusy(false);
        return false;
      }
      return await loadTasks(session);
    } catch (connectError) {
      setStatus('error');
      setError(readableError(connectError));
      setBusy(false);
      return false;
    }
  }

  async function disconnect() {
    requestVersion.current += 1;
    await clearMicrosoftSession();
    await clearRemoteState();
    setError(undefined);
    setBusy(false);
    setStatus(configured ? 'disconnected' : 'unconfigured');
  }

  async function refresh() {
    const session = await activeSession();
    if (!session) return;
    await loadTasks(session, true);
  }

  async function toggleTask(task: TaskItem) {
    if (!task.listId) {
      setError('La tarea no indica a qué lista de Microsoft pertenece.');
      return false;
    }

    const session = await activeSession();
    if (!session) return false;

    const taskKey = `${task.listId}:${task.id}`;
    const completed = !task.completed;
    setUpdatingTaskIds((current) => [...current, taskKey]);
    replaceTask({ ...task, completed });
    setError(undefined);

    try {
      await updateMicrosoftTodoTaskStatus(session.accessToken, task.listId, task.id, completed);
      return true;
    } catch (updateError) {
      replaceTask(task);
      await handleMutationError(updateError);
      return false;
    } finally {
      setUpdatingTaskIds((current) => current.filter((id) => id !== taskKey));
    }
  }

  async function createTask(listId: string, fields: TaskFields) {
    const list = listsRef.current.find((item) => item.id === listId);
    if (!list) {
      setError('Selecciona una lista de Microsoft válida.');
      return false;
    }
    const session = await activeSession();
    if (!session) return false;

    setCreatingTask(true);
    setError(undefined);
    try {
      const created = await createMicrosoftTodoTask(session.accessToken, list, fields);
      applySnapshot(listsRef.current, [created, ...tasksRef.current]);
      return true;
    } catch (createError) {
      await handleMutationError(createError);
      return false;
    } finally {
      setCreatingTask(false);
    }
  }

  async function updateTask(task: TaskItem, fields: TaskFields) {
    if (!task.listId) {
      setError('La tarea no indica a qué lista de Microsoft pertenece.');
      return false;
    }
    const session = await activeSession();
    if (!session) return false;

    const taskKey = `${task.listId}:${task.id}`;
    setUpdatingTaskIds((current) => [...current, taskKey]);
    setError(undefined);
    try {
      const updated = await updateMicrosoftTodoTask(session.accessToken, task, fields);
      replaceTask(updated);
      return true;
    } catch (updateError) {
      await handleMutationError(updateError);
      return false;
    } finally {
      setUpdatingTaskIds((current) => current.filter((id) => id !== taskKey));
    }
  }

  async function deleteTask(task: TaskItem) {
    if (!task.listId) {
      setError('La tarea no indica a qué lista de Microsoft pertenece.');
      return false;
    }
    const session = await activeSession();
    if (!session) return false;

    const taskKey = `${task.listId}:${task.id}`;
    setUpdatingTaskIds((current) => [...current, taskKey]);
    setError(undefined);
    try {
      await deleteMicrosoftTodoTask(session.accessToken, task);
      removeTask(task);
      return true;
    } catch (deleteError) {
      await handleMutationError(deleteError);
      return false;
    } finally {
      setUpdatingTaskIds((current) => current.filter((id) => id !== taskKey));
    }
  }

  return (
    <MicrosoftTodoContext.Provider value={{
      status,
      busy,
      lists,
      tasks,
      creatingTask,
      updatingTaskIds,
      error,
      connect,
      disconnect,
      refresh,
      toggleTask,
      createTask,
      updateTask,
      deleteTask,
    }}>
      {children}
    </MicrosoftTodoContext.Provider>
  );
}

export function useMicrosoftTodo() {
  const context = useContext(MicrosoftTodoContext);
  if (!context) throw new Error('useMicrosoftTodo debe usarse dentro de MicrosoftTodoProvider.');
  return context;
}
