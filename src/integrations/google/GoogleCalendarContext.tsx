import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import type { CalendarEntry } from '../../types';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  googleSupabaseSession,
  hasGoogleIdentity,
  waitForGoogleCredentialSync,
} from './googleAuth';
import { fetchGoogleCalendarSnapshot, isGoogleConfigured, type GoogleCalendarItem } from './googleCalendar';

type GoogleConnectionStatus = 'unconfigured' | 'disconnected' | 'connecting' | 'connected' | 'error';

type GoogleCalendarContextValue = {
  status: GoogleConnectionStatus;
  calendars: GoogleCalendarItem[];
  events: CalendarEntry[];
  visibleCalendarIds: string[];
  busy: boolean;
  error?: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: (rangeStart: Date, rangeEnd: Date) => Promise<void>;
  setCalendarVisible: (calendarId: string, visible: boolean) => void;
};

const GoogleCalendarContext = createContext<GoogleCalendarContextValue | undefined>(undefined);

function readableError(error: unknown) {
  return error instanceof Error ? error.message : 'Se produjo un error inesperado con Google Calendar.';
}

export function GoogleCalendarProvider({ children }: PropsWithChildren) {
  const configured = isGoogleConfigured();
  const [status, setStatus] = useState<GoogleConnectionStatus>(configured ? 'connecting' : 'unconfigured');
  const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
  const [events, setEvents] = useState<CalendarEntry[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useLocalStorage<string[]>('mipanel.google.visibleCalendarIds', []);
  const [busy, setBusy] = useState(configured);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!configured) return;
    void waitForGoogleCredentialSync()
      .then(() => hasGoogleIdentity())
      .then((linked) => {
        setStatus(linked ? 'connected' : 'disconnected');
        setBusy(false);
      })
      .catch((identityError) => {
        setStatus('error');
        setError(readableError(identityError));
        setBusy(false);
      });
  }, [configured]);

  async function refresh(rangeStart: Date, rangeEnd: Date) {
    if (!configured || status === 'disconnected' || status === 'unconfigured') return;
    setBusy(true);
    setError(undefined);
    try {
      const session = await googleSupabaseSession();
      if (!session) {
        setStatus('disconnected');
        setCalendars([]);
        setEvents([]);
        return;
      }
      const snapshot = await fetchGoogleCalendarSnapshot(session.access_token, rangeStart, rangeEnd, visibleCalendarIds);
      const nextVisible = visibleCalendarIds.length
        ? visibleCalendarIds.filter((id) => snapshot.calendars.some((calendar) => calendar.id === id))
        : snapshot.calendars.map((calendar) => calendar.id);
      if (nextVisible.length !== visibleCalendarIds.length || nextVisible.some((id, index) => id !== visibleCalendarIds[index])) {
        setVisibleCalendarIds(nextVisible);
      }
      setCalendars(snapshot.calendars);
      setEvents(snapshot.events);
      setStatus('connected');
    } catch (refreshError) {
      setStatus('error');
      setError(readableError(refreshError));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setError(undefined);
    setStatus('connecting');
    try {
      await connectGoogleCalendar();
    } catch (connectError) {
      setStatus('error');
      setError(readableError(connectError));
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectGoogleCalendar();
      setStatus('disconnected');
      setCalendars([]);
      setEvents([]);
      setVisibleCalendarIds([]);
      setError(undefined);
    } catch (disconnectError) {
      setStatus('error');
      setError(readableError(disconnectError));
    } finally {
      setBusy(false);
    }
  }

  function setCalendarVisible(calendarId: string, visible: boolean) {
    setVisibleCalendarIds((current) => visible
      ? [...new Set([...current, calendarId])]
      : current.filter((id) => id !== calendarId));
  }

  return (
    <GoogleCalendarContext.Provider value={{
      status,
      calendars,
      events,
      visibleCalendarIds,
      busy,
      error,
      connect,
      disconnect,
      refresh,
      setCalendarVisible,
    }}>
      {children}
    </GoogleCalendarContext.Provider>
  );
}

export function useGoogleCalendar() {
  const context = useContext(GoogleCalendarContext);
  if (!context) throw new Error('useGoogleCalendar debe usarse dentro de GoogleCalendarProvider.');
  return context;
}
