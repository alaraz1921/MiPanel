import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import type { CalendarEntry, CalendarEventFields } from '../../types';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  googleSupabaseSession,
  hasGoogleIdentity,
  waitForGoogleCredentialSync,
} from './googleAuth';
import { createGoogleEvent, fetchGoogleCalendarSnapshot, isGoogleConfigured, mutateGoogleEvent, type GoogleCalendarItem } from './googleCalendar';

type GoogleConnectionStatus = 'unconfigured' | 'disconnected' | 'connecting' | 'connected' | 'error';

type GoogleCalendarContextValue = {
  status: GoogleConnectionStatus;
  calendars: GoogleCalendarItem[];
  events: CalendarEntry[];
  visibleCalendarIds: string[];
  busy: boolean;
  error?: string;
  canWriteEvents: boolean;
  connect: (withWrite?: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: (rangeStart: Date, rangeEnd: Date) => Promise<void>;
  setCalendarVisible: (calendarId: string, visible: boolean) => void;
  updateEvent: (event: CalendarEntry, fields: CalendarEventFields) => Promise<boolean>;
  deleteEvent: (event: CalendarEntry) => Promise<boolean>;
  createEvent: (calendarId: string, fields: CalendarEventFields) => Promise<boolean>;
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
  // null: aún sin selección; []: el usuario ha ocultado todos los calendarios.
  const [visibleCalendarIds, setVisibleCalendarIds] = useLocalStorage<string[] | null>('mipanel.google.visibleCalendarIds', null);
  const [busy, setBusy] = useState(configured);
  const [error, setError] = useState<string>();
  const [canWriteEvents, setCanWriteEvents] = useState(false);
  const revision = useRef(0);
  const mutating = useRef(false);
  const recheckAuthorization = useRef(false);

  useEffect(() => {
    if (!configured) return;
    void waitForGoogleCredentialSync()
      .then((recheck) => {
        recheckAuthorization.current = recheck;
        return hasGoogleIdentity();
      })
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
    if (!configured || mutating.current || status === 'disconnected' || status === 'unconfigured') return;
    const requestRevision = ++revision.current;
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
      const snapshot = await fetchGoogleCalendarSnapshot(session.access_token, rangeStart, rangeEnd, visibleCalendarIds ?? [], recheckAuthorization.current);
      if (requestRevision !== revision.current) return;
      recheckAuthorization.current = false;
      const nextVisible = visibleCalendarIds !== null
        ? visibleCalendarIds.filter((id) => snapshot.calendars.some((calendar) => calendar.id === id))
        : snapshot.calendars.map((calendar) => calendar.id);
      if (visibleCalendarIds === null || nextVisible.length !== visibleCalendarIds.length || nextVisible.some((id, index) => id !== visibleCalendarIds[index])) {
        setVisibleCalendarIds(nextVisible);
      }
      setCalendars(snapshot.calendars);
      setEvents(snapshot.events.filter((event) => nextVisible.includes(event.sourceContainerId ?? '')));
      setCanWriteEvents(snapshot.canWriteEvents);
      setStatus('connected');
    } catch (refreshError) {
      if (requestRevision !== revision.current) return;
      setStatus('error');
      setError(readableError(refreshError));
    } finally {
      if (requestRevision === revision.current) setBusy(false);
    }
  }

  async function connect(withWrite = false) {
    setError(undefined);
    setStatus('connecting');
    try {
      await connectGoogleCalendar(withWrite);
    } catch (connectError) {
      setStatus('error');
      setError(readableError(connectError));
    }
  }

  async function disconnect() {
    revision.current += 1;
    setBusy(true);
    try {
      await disconnectGoogleCalendar();
      setStatus('disconnected');
      setCalendars([]);
      setEvents([]);
      setCanWriteEvents(false);
      setVisibleCalendarIds(null);
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
      ? [...new Set([...(current ?? []), calendarId])]
      : (current ?? []).filter((id) => id !== calendarId));
  }

  async function writeEvent(event: CalendarEntry | undefined, fields?: CalendarEventFields, calendarId?: string) {
    if (mutating.current) return false;
    mutating.current = true;
    revision.current += 1;
    setBusy(true);
    setError(undefined);
    try {
      if (!canWriteEvents) throw new Error('Autoriza la edición de Google para modificar eventos.');
      const session = await googleSupabaseSession();
      if (!session) throw new Error('Vuelve a conectar Google.');
      if (event) {
        const updated = await mutateGoogleEvent(session.access_token, event, fields);
        setEvents((current) => updated
          ? current.map((item) => item.id === event.id ? updated : item)
          : current.filter((item) => item.id !== event.id));
      } else {
        const calendar = calendars.find((item) => item.id === calendarId && item.canEdit);
        if (!calendar || !fields) throw new Error('Selecciona un calendario con permiso de escritura.');
        const created = await createGoogleEvent(session.access_token, calendar, fields);
        // Hacer visible el destino para que el evento recién creado no parezca perdido.
        setCalendarVisible(calendar.id, true);
        setEvents((current) => [...current, created]);
      }
      return true;
    } catch (mutationError) {
      setError(readableError(mutationError));
      return false;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  return (
    <GoogleCalendarContext.Provider value={{
      status,
      calendars,
      events,
      visibleCalendarIds: visibleCalendarIds ?? [],
      busy,
      error,
      canWriteEvents,
      connect,
      disconnect,
      refresh,
      setCalendarVisible,
      updateEvent: (event, fields) => writeEvent(event, fields),
      deleteEvent: (event) => writeEvent(event),
      createEvent: (calendarId, fields) => writeEvent(undefined, fields, calendarId),
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
