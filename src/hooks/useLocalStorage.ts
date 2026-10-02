import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { localStorageAdapter } from '../storage/localStorageAdapter';

type StoredValue = unknown;
type Subscriber = (value: StoredValue) => void;

type StoreEntry = {
  loaded: boolean;
  value: StoredValue;
  subscribers: Set<Subscriber>;
};

const entries = new Map<string, StoreEntry>();
let storageListenerRegistered = false;

function notify(entry: StoreEntry) {
  for (const subscriber of entry.subscribers) subscriber(entry.value);
}

function registerStorageListener() {
  if (storageListenerRegistered) return;

  window.addEventListener('storage', (event) => {
    if (event.storageArea !== window.localStorage || !event.key) return;
    const entry = entries.get(event.key);
    if (!entry) return;

    try {
      entry.value = event.newValue === null ? undefined : JSON.parse(event.newValue) as StoredValue;
      entry.loaded = true;
      notify(entry);
    } catch {
      // Un valor no válido de otra pestaña no debe romper la interfaz actual.
    }
  });
  storageListenerRegistered = true;
}

/** Persiste preferencias locales del navegador y sincroniza sus consumidores activos. */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    registerStorageListener();

    let entry = entries.get(key);
    if (!entry) {
      entry = { loaded: false, value: initialValue, subscribers: new Set() };
      entries.set(key, entry);
    }

    const subscriber: Subscriber = (nextValue) => setValue((nextValue ?? initialValue) as T);
    entry.subscribers.add(subscriber);

    if (entry.loaded) {
      setValue((entry.value ?? initialValue) as T);
    } else {
      void localStorageAdapter.get<T>(key).then((storedValue) => {
        const current = entries.get(key);
        if (!current || current.loaded) return;
        current.value = storedValue ?? initialValue;
        current.loaded = true;
        notify(current);
      });
    }

    return () => {
      entry?.subscribers.delete(subscriber);
    };
  }, [initialValue, key]);

  const updateValue: Dispatch<SetStateAction<T>> = (nextValue) => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { loaded: true, value: initialValue, subscribers: new Set() };
      entries.set(key, entry);
    }

    const currentValue = (entry.value ?? initialValue) as T;
    const resolvedValue = typeof nextValue === 'function'
      ? (nextValue as (current: T) => T)(currentValue)
      : nextValue;

    entry.value = resolvedValue;
    entry.loaded = true;
    notify(entry);
    void localStorageAdapter.set(key, resolvedValue).catch(() => undefined);
  };

  return [value, updateValue] as const;
}
