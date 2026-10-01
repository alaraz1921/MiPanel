import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type StoredValue = unknown;
type Subscriber = (value: StoredValue) => void;

type StoreEntry = {
  loaded: boolean;
  value: StoredValue;
  subscribers: Set<Subscriber>;
};

const entries = new Map<string, StoreEntry>();
let chromeListenerRegistered = false;

function extensionStorageAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

async function readStoredValue<T>(key: string): Promise<T | undefined> {
  if (extensionStorageAvailable()) {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }

  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? undefined : JSON.parse(stored) as T;
  } catch {
    return undefined;
  }
}

async function writeStoredValue<T>(key: string, value: T) {
  if (extensionStorageAvailable()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function notify(entry: StoreEntry) {
  for (const subscriber of entry.subscribers) subscriber(entry.value);
}

function registerChromeListener() {
  if (chromeListenerRegistered || !extensionStorageAvailable()) return;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    for (const [key, change] of Object.entries(changes)) {
      const entry = entries.get(key);
      if (!entry || change.newValue === undefined) continue;
      entry.value = change.newValue;
      entry.loaded = true;
      notify(entry);
    }
  });
  chromeListenerRegistered = true;
}

/**
 * Persiste datos en chrome.storage.local y sincroniza todos los consumidores de
 * una misma clave. localStorage se conserva únicamente como respaldo de npm run
 * dev, donde las APIs de extensión no están disponibles.
 */
export function useExtensionStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    registerChromeListener();

    let entry = entries.get(key);
    if (!entry) {
      entry = { loaded: false, value: initialValue, subscribers: new Set() };
      entries.set(key, entry);
    }

    const subscriber: Subscriber = (nextValue) => setValue(nextValue as T);
    entry.subscribers.add(subscriber);

    if (entry.loaded) {
      setValue(entry.value as T);
    } else {
      void readStoredValue<T>(key)
        .then((storedValue) => {
          const current = entries.get(key);
          if (!current || current.loaded) return;
          current.value = storedValue ?? initialValue;
          current.loaded = true;
          notify(current);
        })
        .catch(() => {
          const current = entries.get(key);
          if (!current || current.loaded) return;
          current.value = initialValue;
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

    const currentValue = entry.value as T;
    const resolvedValue = typeof nextValue === 'function'
      ? (nextValue as (current: T) => T)(currentValue)
      : nextValue;

    entry.value = resolvedValue;
    entry.loaded = true;
    notify(entry);
    void writeStoredValue(key, resolvedValue).catch(() => {
      // La UI mantiene el valor en memoria; una futura capa de diagnóstico
      // podrá mostrar errores de almacenamiento al usuario.
    });
  };

  return [value, updateValue] as const;
}
