import type { CalendarEntry, Shortcut, TaskItem } from '../types';

export const defaultShortcuts: Shortcut[] = [
  { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', icon: '✉️' },
  { id: 'drive', label: 'Drive', url: 'https://drive.google.com', icon: '📁' },
  { id: 'calendar', label: 'Calendar', url: 'https://calendar.google.com', icon: '📅' },
  { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com', icon: '✦' },
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
];

const iso = (offsetDays: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

export const initialTasks: TaskItem[] = [
  {
    id: 'task-1',
    title: 'Revisar presupuesto',
    completed: false,
    dueDate: iso(0),
    reminderDateTime: `${iso(0)}T10:30`,
    listName: 'Trabajo',
    important: true,
    source: 'mock',
  },
  {
    id: 'task-2',
    title: 'Llamar al proveedor',
    completed: false,
    dueDate: iso(1),
    listName: 'Trabajo',
    source: 'mock',
  },
  {
    id: 'task-3',
    title: 'Comprar material',
    completed: false,
    reminderDateTime: `${iso(2)}T18:00`,
    listName: 'Personal',
    source: 'mock',
  },
];

export const mockCalendarEntries: CalendarEntry[] = [
  {
    id: 'cal-1',
    title: 'Reunión de seguimiento',
    date: iso(0),
    time: '09:00',
    kind: 'event',
    source: 'mock',
    calendarName: 'Google · Trabajo',
  },
  {
    id: 'cal-2',
    title: 'Cita personal',
    date: iso(3),
    time: '17:30',
    kind: 'event',
    source: 'mock',
    calendarName: 'Google · Personal',
  },
];
