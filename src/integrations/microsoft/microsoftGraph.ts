import type { TaskItem, TaskList } from '../../types';

export const MICROSOFT_SCOPES = ['Tasks.Read'];

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const MAX_THROTTLE_RETRIES = 3;

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
  dueDateTime?: GraphDateTime;
  reminderDateTime?: GraphDateTime;
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

async function graphGet<T>(url: string, accessToken: string): Promise<T> {
  if (!url.startsWith(`${GRAPH_ROOT}/`)) throw new Error('URL de Microsoft Graph no permitida.');
  const requestPath = new URL(url).pathname;

  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (response.ok) return response.json() as Promise<T>;

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

async function getCollection<T>(initialUrl: string, accessToken: string) {
  const items: T[] = [];
  let nextUrl: string | undefined = initialUrl;

  while (nextUrl) {
    const page: GraphCollection<T> = await graphGet(nextUrl, accessToken);
    items.push(...page.value);
    nextUrl = page['@odata.nextLink'];
  }
  return items;
}

function datePart(value?: GraphDateTime) {
  return value?.dateTime.slice(0, 10);
}

function dateTimePart(value?: GraphDateTime) {
  return value?.dateTime.slice(0, 16);
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

export async function fetchMicrosoftTodoSnapshot(accessToken: string): Promise<MicrosoftTodoSnapshot> {
  const lists = await getCollection<GraphTodoList>(
    `${GRAPH_ROOT}/me/todo/lists`,
    accessToken,
  );

  const tasks: TaskItem[] = [];
  for (const list of lists) {
    const listId = encodeURIComponent(list.id);
    const listTasks = await getCollection<GraphTodoTask>(
      `${GRAPH_ROOT}/me/todo/lists/${listId}/tasks`,
      accessToken,
    );
    tasks.push(...listTasks.map((task) => normalizeTask(task, list)));
  }

  return {
    lists: lists.map((list) => ({ id: list.id, name: list.displayName })),
    tasks,
  };
}
