import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { TaskItem, TaskList } from '../../types';
import {
  clearMicrosoftSession,
  connectMicrosoft,
  isMicrosoftConfigured,
  readMicrosoftSession,
  type MicrosoftTokenSession,
} from './microsoftAuth';
import {
  fetchMicrosoftTodoSnapshot,
  MicrosoftGraphError,
  updateMicrosoftTodoTaskStatus,
} from './microsoftGraph';

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
  updatingTaskIds: string[];
  error?: string;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  toggleTask: (task: TaskItem) => Promise<boolean>;
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
  const [updatingTaskIds, setUpdatingTaskIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const requestVersion = useRef(0);

  async function loadTasks(session: MicrosoftTokenSession, keepConnected = false) {
    const version = ++requestVersion.current;
    setBusy(true);
    if (!keepConnected) setStatus('connecting');
    setError(undefined);

    try {
      const snapshot = await fetchMicrosoftTodoSnapshot(session.accessToken);
      if (version !== requestVersion.current) return false;
      setLists(snapshot.lists);
      setTasks(snapshot.tasks);
      setStatus('connected');
      return true;
    } catch (loadError) {
      if (version !== requestVersion.current) return false;
      if (loadError instanceof MicrosoftGraphError && loadError.status === 401) {
        await clearMicrosoftSession();
        setStatus('disconnected');
        setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
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
    setLists([]);
    setTasks([]);
    setError(undefined);
    setBusy(false);
    setStatus(configured ? 'disconnected' : 'unconfigured');
  }

  async function refresh() {
    const session = await readMicrosoftSession();
    if (!session) {
      setStatus('disconnected');
      setLists([]);
      setTasks([]);
      setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
      return;
    }
    await loadTasks(session, true);
  }

  async function toggleTask(task: TaskItem) {
    if (!task.listId) {
      setError('La tarea no indica a qué lista de Microsoft pertenece.');
      return false;
    }

    const session = await readMicrosoftSession();
    if (!session) {
      setStatus('disconnected');
      setLists([]);
      setTasks([]);
      setError('La sesión de Microsoft ha caducado o necesita autorizar Tasks.ReadWrite. Vuelve a conectar la cuenta.');
      return false;
    }

    const taskKey = `${task.listId}:${task.id}`;
    const completed = !task.completed;
    setUpdatingTaskIds((current) => [...current, taskKey]);
    setTasks((current) => current.map((item) => (
      item.id === task.id && item.listId === task.listId ? { ...item, completed } : item
    )));
    setError(undefined);

    try {
      await updateMicrosoftTodoTaskStatus(session.accessToken, task.listId, task.id, completed);
      return true;
    } catch (updateError) {
      setTasks((current) => current.map((item) => (
        item.id === task.id && item.listId === task.listId ? { ...item, completed: task.completed } : item
      )));
      if (updateError instanceof MicrosoftGraphError && updateError.status === 401) {
        await clearMicrosoftSession();
        setStatus('disconnected');
        setLists([]);
        setTasks([]);
        setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
      } else {
        setError(readableError(updateError));
      }
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
      updatingTaskIds,
      error,
      connect,
      disconnect,
      refresh,
      toggleTask,
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
