# Prompt sugerido para la siguiente fase

Usar únicamente después de confirmar que la Fase 0.5 funciona en Chrome, Brave y Edge:

---

Lee `AGENTS.md`, `docs/ESPECIFICACION_MIPANEL.md` y `docs/ROADMAP.md` antes de tocar código.

Implementa solo la Fase 1: autenticación de Microsoft como cliente público y lectura de Microsoft To Do en la extensión Chromium.

- Mantén el modo demo cuando Microsoft no esté configurado o conectado.
- Solicita únicamente `Tasks.Read`; no implementes creación, edición, completado ni borrado.
- Estudia Authorization Code + PKCE y las APIs de identidad de extensión adecuadas.
- Obtén el redirect a partir del ID real de la extensión; no uses localhost.
- Considera que Chrome Web Store y Edge Add-ons pueden asignar IDs distintos.
- Nunca uses client secret ni almacenes tokens sensibles en `chrome.storage.sync`.
- Conserva tipos internos normalizados y las integraciones separadas por proveedor.
- No implementes Google Calendar, backend, Electron, Tauri ni PWA.
- Documenta la configuración de Entra y cualquier prueba manual necesaria.

Antes de terminar, ejecuta `npm run typecheck` y `npm run build` y prueba la extensión compilada.

---
