import type { TaskFields, TaskItem, TaskList } from '../../types';

export const MICROSOFT_SCOPES = ['Tasks.ReadWrite'];

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const MAX_THROTTLE_RETRIES = 3;
const DIRECT_REQUEST_TIMEOUT_MS = 15_000;
const BACKEND_REQUEST_TIMEOUT_MS = 3_000;
const USE_GRAPH_BACKEND = false;

export type MicrosoftGraphSession = {
  accessToken: string;
  supabaseAccessToken?: string;
};

type GraphCollection<T> = {
  value: T[];
  '@odata.nextLink'?: string;
};

type GraphTodoList = {
  id: string;
  displayName: string;
};

type GraphDateTime = {
  dateTime: string;
  timeZone: string;
};

type GraphTodoTask = {
  id: string;
  title: string;
  status: string;
  importance?: string;
  dueDateTime?: GraphDateTime | null;
  reminderDateTime?: GraphDateTime | null;
  isReminderOn?: boolean;
};

type GraphErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class MicrosoftGraphError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'MicrosoftGraphError';
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(retryDate - Date.now(), 0);
  }
  return 1000 * (2 ** attempt);
}

async function graphRequest<T>(url: string, session: MicrosoftGraphSession, init?: RequestInit): Promise<T> {
  if (!url.startsWith(`${GRAPH_ROOT}/`)) throw new Error('URL de Microsoft Graph no permitida.');
  const requestPath = new URL(url).pathname;

  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt += 1) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
    const backendPath = requestPath.replace('/v1.0', '');
    // La ruta backend queda desactivada temporalmente hasta completar su
    // diagnóstico. Supabase sigue gestionando la sesión del usuario.
    const useBackend = USE_GRAPH_BACKEND && Boolean(session.supabaseAccessToken && supabaseUrl);
    const requestUrl = useBackend
      ? `${supabaseUrl}/functions/v1/microsoft-graph?path=${encodeURIComponent(backendPath)}`
      : url;
    const request = async (targetUrl: string, requestInit: RequestInit, timeoutMs: number) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(targetUrl, { ...requestInit, signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    const backendInit: RequestInit = {
      ...init,
      headers: {
        Authorization: `Bearer ${session.supabaseAccessToken ?? ''}`,
        'x-microsoft-access-token': session.accessToken,
        Accept: 'application/json',
        ...init?.headers,
      },
    };
    const directInit: RequestInit = {
      ...init,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
        ...init?.headers,
      },
    };
    let response: Response;
    try {
      response = await request(
        requestUrl,
        useBackend ? backendInit : directInit,
        useBackend ? BACKEND_REQUEST_TIMEOUT_MS : DIRECT_REQUEST_TIMEOUT_MS,
      );
    } catch (requestError) {
      if (!useBackend) throw requestError;
      // Fallback temporal mientras se diagnostica una Edge Function que no responda.
      response = await request(url, directInit, DIRECT_REQUEST_TIMEOUT_MS);
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    }

    let graphError: GraphErrorResponse | undefined;
    try {
      graphError = await response.json() as GraphErrorResponse;
    } catch {
      // Algunas respuestas intermedias pueden no incluir un cuerpo JSON.
    }

    if (response.status === 429 && attempt < MAX_THROTTLE_RETRIES) {
      await wait(retryDelay(response, attempt));
      continue;
    }

    const code = graphError?.error?.code;
    const detail = graphError?.error?.message;
    const suffix = [code, detail].filter(Boolean).join(': ');
    throw new MicrosoftGraphError(
      suffix
        ? `Microsoft Graph respondió con el estado ${response.status} en ${requestPath}: ${suffix}`
        : `Microsoft Graph respondió con el estado ${response.status} en ${requestPath}.`,
      response.status,
      code,
    );
  }

  throw new Error('No se pudo completar la petición a Microsoft Graph.');
}

function graphGet<T>(url: string, session: MicrosoftGraphSession) {
  return graphRequest<T>(url, session);
}

async function getCollection<T>(initialUrl: string, session: MicrosoftGraphSession) {
  const items: T[] = [];
  let nextUrl: string | undefined = initialUrl;

  while (nextUrl) {
    const page: GraphCollection<T> = await graphGet(nextUrl, session);
    items.push(...page.value);
    nextUrl = page['@odata.nextLink'];
  }
  return items;
}

function datePart(value?: GraphDateTime | null) {
  return value?.dateTime.slice(0, 10);
}

function dateTimePart(value?: GraphDateTime | null) {
  if (!value) return undefined;
  if (value.timeZone.toUpperCase() !== 'UTC') return value.dateTime.slice(0, 16);

  const date = new Date(`${value.dateTime.replace(/Z$/, '')}Z`);
  if (Number.isNaN(date.getTime())) return value.dateTime.slice(0, 16);
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizeTask(task: GraphTodoTask, list: GraphTodoList): TaskItem {
  return {
    id: task.id,
    title: task.title,
    completed: task.status === 'completed',
    important: task.importance === 'high',
    dueDate: datePart(task.dueDateTime),
    reminderDateTime: task.isReminderOn ? dateTimePart(task.reminderDateTime) : undefined,
    listId: list.id,
    listName: list.displayName,
    source: 'microsoft-todo',
  };
}

export type MicrosoftTodoSnapshot = {
  lists: TaskList[];
  tasks: TaskItem[];
};

function taskUrl(listId: string, taskId?: string) {
  const listPath = encodeURIComponent(listId);
  const taskPath = taskId ? `/${encodeURIComponent(taskId)}` : '';
  return `${GRAPH_ROOT}/me/todo/lists/${listPath}/tasks${taskPath}`;
}

function graphDate(date?: string): GraphDateTime | null {
  return date ? { dateTime: `${date}T00:00:00`, timeZone: 'UTC' } : null;
}

function graphReminder(dateTime?: string): GraphDateTime | null {
  if (!dateTime) return null;
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) throw new Error('La fecha del recordatorio no es válida.');
  return { dateTime: date.toISOString().replace(/Z$/, ''), timeZone: 'UTC' };
}

function taskBody(fields: TaskFields, clearMissingDates: boolean) {
  const title = fields.title.trim();
  if (!title) throw new Error('El título de la tarea es obligatorio.');
  return {
    title,
    importance: fields.important ? 'high' : 'normal',
    ...(fields.dueDate || clearMissingDates ? { dueDateTime: graphDate(fields.dueDate) } : {}),
    ...(fields.reminderDateTime || clearMissingDates
      ? {
          reminderDateTime: graphReminder(fields.reminderDateTime),
          isReminderOn: Boolean(fields.reminderDateTime),
        }
      : {}),
  };
}

export async function fetchMicrosoftTodoSnapshot(session: MicrosoftGraphSession): Promise<MicrosoftTodoSnapshot> {
  const lists = await getCollection<GraphTodoList>(
    `${GRAPH_ROOT}/me/todo/lists`,
    session,
  );

  const tasks: TaskItem[] = [];
  for (const list of lists) {
    const listId = encodeURIComponent(list.id);
    const listTasks = await getCollection<GraphTodoTask>(
      `${GRAPH_ROOT}/me/todo/lists/${listId}/tasks`,
      session,
    );
    tasks.push(...listTasks.map((task) => normalizeTask(task, list)));
  }

  return {
    lists: lists.map((list) => ({ id: list.id, name: list.displayName })),
    tasks,
  };
}

export async function updateMicrosoftTodoTaskStatus(
  session: MicrosoftGraphSession,
  listId: string,
  taskId: string,
  completed: boolean,
) {
  await graphRequest<void>(
    taskUrl(listId, taskId),
    session,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: completed ? 'completed' : 'notStarted' }),
    },
  );
}

export async function createMicrosoftTodoTask(
  session: MicrosoftGraphSession,
  list: TaskList,
  fields: TaskFields,
) {
  const task = await graphRequest<GraphTodoTask>(taskUrl(list.id), session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskBody(fields, false)),
  });
  return normalizeTask(task, { id: list.id, displayName: list.name });
}

export async function updateMicrosoftTodoTask(
  session: MicrosoftGraphSession,
  task: TaskItem,
  fields: TaskFields,
) {
  if (!task.listId) throw new Error('La tarea no indica a qué lista de Microsoft pertenece.');
  const updated = await graphRequest<GraphTodoTask>(taskUrl(task.listId, task.id), session, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskBody(fields, true)),
  });
  return normalizeTask(updated, { id: task.listId, displayName: task.listName });
}

export async function deleteMicrosoftTodoTask(
  session: MicrosoftGraphSession,
  task: TaskItem,
) {
  if (!task.listId) throw new Error('La tarea no indica a qué lista de Microsoft pertenece.');
  await graphRequest<void>(taskUrl(task.listId, task.id), session, { method: 'DELETE' });
}
