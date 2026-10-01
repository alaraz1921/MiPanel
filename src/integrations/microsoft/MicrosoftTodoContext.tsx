import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { TaskItem } from '../../types';
import {
  clearMicrosoftSession,
  connectMicrosoft,
  isMicrosoftConfigured,
  readMicrosoftSession,
  type MicrosoftTokenSession,
} from './microsoftAuth';
import { fetchMicrosoftTodoTasks, MicrosoftGraphError } from './microsoftGraph';

export type MicrosoftConnectionStatus =
  | 'unconfigured'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

type MicrosoftTodoContextValue = {
  status: MicrosoftConnectionStatus;
  busy: boolean;
  tasks: TaskItem[];
  error?: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
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
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [error, setError] = useState<string>();
  const requestVersion = useRef(0);

  async function loadTasks(session: MicrosoftTokenSession, keepConnected = false) {
    const version = ++requestVersion.current;
    setBusy(true);
    if (!keepConnected) setStatus('connecting');
    setError(undefined);

    try {
      const nextTasks = await fetchMicrosoftTodoTasks(session.accessToken);
      if (version !== requestVersion.current) return;
      setTasks(nextTasks);
      setStatus('connected');
    } catch (loadError) {
      if (version !== requestVersion.current) return;
      if (loadError instanceof MicrosoftGraphError && loadError.status === 401) {
        await clearMicrosoftSession();
        setStatus('disconnected');
        setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
      } else {
        setStatus('error');
        setError(readableError(loadError));
      }
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
      await loadTasks(session);
    } catch (connectError) {
      setStatus('error');
      setError(readableError(connectError));
      setBusy(false);
    }
  }

  async function disconnect() {
    requestVersion.current += 1;
    await clearMicrosoftSession();
    setTasks([]);
    setError(undefined);
    setBusy(false);
    setStatus(configured ? 'disconnected' : 'unconfigured');
  }

  async function refresh() {
    const session = await readMicrosoftSession();
    if (!session) {
      setStatus('disconnected');
      setTasks([]);
      setError('La sesión de Microsoft ha caducado. Vuelve a conectar la cuenta.');
      return;
    }
    await loadTasks(session, true);
  }

  return (
    <MicrosoftTodoContext.Provider value={{ status, busy, tasks, error, connect, disconnect, refresh }}>
      {children}
    </MicrosoftTodoContext.Provider>
  );
}

export function useMicrosoftTodo() {
  const context = useContext(MicrosoftTodoContext);
  if (!context) throw new Error('useMicrosoftTodo debe usarse dentro de MicrosoftTodoProvider.');
  return context;
}
