import type { MicrosoftTodoSnapshot } from './microsoftGraph';

const CACHE_KEY = 'mipanel.microsoft.todoCache';
const CACHE_MAX_AGE_MS = 2 * 60 * 1000;

type MicrosoftTodoCache = MicrosoftTodoSnapshot & {
  cachedAt: number;
};

function sessionStorageAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.session);
}

export async function readMicrosoftTodoCache(): Promise<MicrosoftTodoSnapshot | undefined> {
  if (!sessionStorageAvailable()) return undefined;
  const result = await chrome.storage.session.get(CACHE_KEY);
  const cache = result[CACHE_KEY] as MicrosoftTodoCache | undefined;
  if (!cache || Date.now() - cache.cachedAt > CACHE_MAX_AGE_MS) {
    await chrome.storage.session.remove(CACHE_KEY);
    return undefined;
  }
  return { lists: cache.lists, tasks: cache.tasks };
}

export async function writeMicrosoftTodoCache(snapshot: MicrosoftTodoSnapshot) {
  if (!sessionStorageAvailable()) return;
  await chrome.storage.session.set({
    [CACHE_KEY]: { ...snapshot, cachedAt: Date.now() } satisfies MicrosoftTodoCache,
  });
}

export async function clearMicrosoftTodoCache() {
  if (sessionStorageAvailable()) await chrome.storage.session.remove(CACHE_KEY);
}
