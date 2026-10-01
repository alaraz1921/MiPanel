/**
 * Integración Microsoft pendiente de la fase 1.
 *
 * Endpoints previstos:
 * - GET /me/todo/lists
 * - GET /me/todo/lists/{listId}/tasks
 * La primera integración será exclusivamente de lectura.
 */
export const MICROSOFT_SCOPES = ['Tasks.Read'];

export function isMicrosoftConfigured() {
  return Boolean(import.meta.env.VITE_MICROSOFT_CLIENT_ID);
}
