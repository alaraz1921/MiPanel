# Prompt sugerido para validar Microsoft To Do

La implementación de lectura ya existe. Usar este texto cuando se disponga de un registro real en Microsoft Entra:

---

Lee `AGENTS.md`, `docs/ESPECIFICACION_MIPANEL.md` y `docs/ROADMAP.md` antes de tocar código.

Completa la validación real de la Fase 1 de Microsoft To Do sin ampliar permisos ni añadir escritura.

- Revisa la implementación existente antes de modificarla.
- Configura el Client ID y tenant públicos mediante `.env.local` y registra el redirect real de cada extensión.
- Verifica conexión, desconexión, caducidad de sesión y actualización bajo demanda.
- Comprueba listas, tareas, vencimientos y recordatorios con una cuenta real.
- Mantén únicamente `Tasks.Read`; no implementes creación, edición, completado ni borrado.
- Nunca uses client secret ni persistas tokens fuera de `chrome.storage.session`.
- Mantén el modo demo cuando Microsoft no esté configurado o conectado.
- No implementes Google Calendar, backend, Electron, Tauri ni PWA.
- Documenta los resultados de Chrome, Brave y Edge sin publicar en tiendas.

Antes de terminar, ejecuta `npm run typecheck` y `npm run build` y prueba la extensión compilada.

---
