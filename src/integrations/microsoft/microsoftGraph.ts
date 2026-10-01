import type { TaskItem } from '../../types';

export const MICROSOFT_SCOPES = ['Tasks.Read'];

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

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

export class MicrosoftGraphError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MicrosoftGraphError';
  }
}

async function graphGet<T>(url: string, accessToken: string): Promise<T> {
  if (!url.startsWith(`${GRAPH_ROOT}/`)) throw new Error('URL de Microsoft Graph no permitida.');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      Prefer: `outlook.timezone="${LOCAL_TIME_ZONE}"`,
    },
  });

  if (!response.ok) {
    throw new MicrosoftGraphError(`Microsoft Graph respondió con el estado ${response.status}.`, response.status);
  }
  return response.json() as Promise<T>;
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
    listName: list.displayName,
    source: 'microsoft-todo',
  };
}

export async function fetchMicrosoftTodoTasks(accessToken: string): Promise<TaskItem[]> {
  const lists = await getCollection<GraphTodoList>(
    `${GRAPH_ROOT}/me/todo/lists?$select=id,displayName`,
    accessToken,
  );

  const tasksByList = await Promise.all(lists.map(async (list) => {
    const listId = encodeURIComponent(list.id);
    const tasks = await getCollection<GraphTodoTask>(
      `${GRAPH_ROOT}/me/todo/lists/${listId}/tasks?$select=id,title,status,importance,dueDateTime,reminderDateTime,isReminderOn`,
      accessToken,
    );
    return tasks.map((task) => normalizeTask(task, list));
  }));

  return tasksByList.flat();
}
