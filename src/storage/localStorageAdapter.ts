export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export const PREFERENCES_REPLACED_EVENT = 'mipanel:preferences-replaced';

/** Sustituye un grupo de preferencias y restaura los originales si no caben. */
export function replaceStoredPreferences(values: Record<string, unknown>, storage: Storage = window.localStorage) {
  const next = Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)] as const);
  const previous = next.map(([key]) => [key, storage.getItem(key)] as const);
  try {
    // Liberar únicamente las preferencias que se sustituyen permite reutilizar
    // el espacio ocupado por el fondo anterior, sin tocar las sesiones.
    for (const [key] of next) storage.removeItem(key);
    for (const [key, value] of next) storage.setItem(key, value);
  } catch {
    try {
      for (const [key] of next) storage.removeItem(key);
      for (const [key, value] of previous) {
        if (value !== null) storage.setItem(key, value);
      }
    } catch {
      throw new Error('El navegador bloqueó el almacenamiento y no pudo restaurar todas las preferencias. Conserva tu archivo de copia para volver a importarlo.');
    }
    throw new Error('No se pudo importar la copia. Puede faltar espacio en el navegador. Se ha conservado la configuración anterior.');
  }
  window.dispatchEvent(new CustomEvent<string[]>(PREFERENCES_REPLACED_EVENT, { detail: next.map(([key]) => key) }));
}

export const localStorageAdapter: StorageAdapter = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? null : JSON.parse(stored) as T;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    window.localStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  },
};
