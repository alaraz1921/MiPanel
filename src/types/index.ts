export type Shortcut = {
  id: string;
  label: string;
  url: string;
  icon?: string;
  customIcon?: string;
  kind?: 'folder';
  folderId?: string;
};

export type TaskSource = 'microsoft-todo';

export type TaskList = {
  id: string;
  name: string;
};

export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  reminderDateTime?: string;
  listId?: string;
  listName: string;
  important?: boolean;
  source: TaskSource;
};

export type TaskFields = {
  title: string;
  dueDate?: string;
  reminderDateTime?: string;
  important: boolean;
};

export type CalendarSource = 'google-calendar' | 'microsoft-todo';

export type CalendarEntry = {
  id: string;
  title: string;
  date: string;
  time?: string;
  kind: 'event' | 'due' | 'reminder';
  source: CalendarSource;
  calendarName?: string;
  color?: string;
  sourceId?: string;
  sourceContainerId?: string;
  endDate?: string;
  endTime?: string;
  timeZone?: string;
  etag?: string;
  canEdit?: boolean;
  recurring?: boolean;
};

export type CalendarEventFields = {
  title: string;
  date: string;
  time?: string;
  endDate: string;
  endTime?: string;
};
