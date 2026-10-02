# Roadmap de MiPanel

## Fase 0 — Base visual

- [x] Buscador, accesos directos y reloj.
- [x] Tareas demo y calendario mensual unificado.
- [x] Persistencia local simple y diseño responsive.

## Fase 0.5 — Extensión Chromium

- [x] Manifest V3 y sustitución de nueva pestaña.
- [x] Una base compatible con Chrome, Brave y Edge.
- [x] Vite con recursos relativos y `dist/` instalable.
- [x] Persistencia mediante `chrome.storage.local`.
- [x] Sincronización inmediata entre tareas y calendario.
- [x] CI con typecheck, build y ZIP instalable.
- [x] Documentación de instalación y pruebas.
- [x] Completar pruebas manuales reales en Chrome, Brave y Edge.

## Fase 0.75 — Distribución (solo tras confirmación)

- [ ] Decidir Chrome Web Store y Edge Add-ons.
- [ ] Comprobar la distribución para Brave.
- [ ] Definir IDs, actualizaciones, metadatos e iconos definitivos.
- [ ] Preparar política de privacidad si fuese necesaria.

## Fase 1 — Microsoft To Do en lectura

- [x] Registrar la aplicación en Microsoft Entra.
- [ ] Incorporar el Client ID público y validar redirects reales según cada ID de extensión.
- [x] Implementar cliente público con Authorization Code + PKCE.
- [x] Conectar/desconectar cuenta sin client secret.
- [x] Solicitar únicamente `Tasks.Read`.
- [x] Leer listas, tareas, vencimientos y recordatorios.
- [x] Integrar datos normalizados en dashboard y calendario.
- [x] Filtrar el panel por una lista seleccionada sin limitar el calendario unificado.
- [ ] Configurar un Client ID real y completar pruebas con cuentas Microsoft.

## Fase 2 — Edición de Microsoft To Do

- [x] Elevar a `Tasks.ReadWrite` al incorporar la primera función de escritura.
- [x] Completar y reabrir tareas.
- [x] Crear tareas en la lista seleccionada.
- [x] Modificar título e importancia y eliminar tareas con confirmación.
- [x] Editar fechas y recordatorios.
- [x] Mantener una caché temporal de sesión para reducir llamadas repetidas a Graph.

## Fase 3 — Google Calendar

- [ ] Registrar/configurar la aplicación y OAuth de extensión.
- [ ] Empezar con permisos de lectura.
- [ ] Leer calendarios y eventos por intervalo.
- [ ] Integrar eventos en el calendario unificado.

## Fase 4 — Productividad

- [x] Permitir una imagen de fondo local configurable.
- [x] Usar confirmaciones propias para completar y eliminar tareas.
- [x] Mantener la sesión de Microsoft entre reinicios mediante renovación segura.
- [x] Reordenar accesos directos mediante arrastre y controles accesibles.
- [x] Mostrar el favicon de cada sitio con fallback local sin servicios externos.
- [x] Filtrar las tareas para mostrar únicamente las vencidas por fecha o recordatorio.
- [ ] Vistas semanal y agenda, filtros, búsqueda y personalización avanzada.
- [ ] Importación/exportación explícita de configuración.

## Fase 5 — Sincronización propia opcional

- [ ] Evaluarla solo si los mecanismos de cada navegador no cubren las necesidades.

Electron, Tauri, PWA, Firefox y Safari no forman parte del roadmap actual.
