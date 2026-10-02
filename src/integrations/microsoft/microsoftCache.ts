import type { MicrosoftTodoSnapshot } from './microsoftGraph';

const CACHE_KEY = 'mipanel.microsoft.todoCache';
const CACHE_MAX_AGE_MS = 2 * 60 * 1000;

type MicrosoftTodoCache = MicrosoftTodoSnapshot & {
  cachedAt: number;
};

export async function readMicrosoftTodoCache(): Promise<MicrosoftTodoSnapshot | undefined> {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    const cache = raw ? JSON.parse(raw) as MicrosoftTodoCache : undefined;
    if (!cache || Date.now() - cache.cachedAt > CACHE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(CACHE_KEY);
      return undefined;
    }
    return { lists: cache.lists, tasks: cache.tasks };
  } catch {
    return undefined;
  }
}

export async function writeMicrosoftTodoCache(snapshot: MicrosoftTodoSnapshot) {
  window.sessionStorage.setItem(
    CACHE_KEY,
    JSON.stringify({ ...snapshot, cachedAt: Date.now() } satisfies MicrosoftTodoCache),
  );
}

export async function clearMicrosoftTodoCache() {
  window.sessionStorage.removeItem(CACHE_KEY);
}
