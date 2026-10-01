export type Shortcut = {
  id: string;
  label: string;
  url: string;
  icon?: string;
};

export type TaskSource = 'microsoft-todo' | 'mock';

export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  reminderDateTime?: string;
  listName: string;
  important?: boolean;
  source: TaskSource;
};

export type CalendarSource = 'google-calendar' | 'microsoft-todo' | 'mock';

export type CalendarEntry = {
  id: string;
  title: string;
  date: string;
  time?: string;
  kind: 'event' | 'due' | 'reminder';
  source: CalendarSource;
  calendarName?: string;
};
