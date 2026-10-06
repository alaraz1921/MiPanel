# Roadmap de MiPanel

## Fase 0 — Base visual

- [x] Buscador, accesos directos y reloj.
- [x] Panel de tareas y calendario mensual unificado, sin datos ficticios.
- [x] Persistencia local simple y diseño responsive.

## Fase 0.5 — Extensión Chromium (legacy)

- [x] Manifest V3 y sustitución de nueva pestaña.
- [x] Una base compatible con Chrome, Brave y Edge.
- [x] Vite con recursos relativos y `dist/` instalable.
- [x] Persistencia mediante `chrome.storage.local`.
- [x] Sincronización inmediata entre tareas y calendario.
- [x] CI con typecheck, build y ZIP instalable.
- [x] Documentación de instalación y pruebas.
- [x] Completar pruebas manuales reales en Chrome, Brave y Edge.

## Fase 0.6 — Aplicación web SPA

- [x] Convertir el build principal a una SPA estática desplegable.
- [x] Sustituir `chrome.storage` por adaptadores basados en `localStorage` y `sessionStorage`.
- [x] Sustituir `chrome.identity` por MSAL Browser con Authorization Code + PKCE.
- [x] Eliminar `manifest.json` y el empaquetado de extensión del build y CI principales.
- [x] Documentar los redirects SPA de Microsoft Entra y la limitación de migración de datos locales.

## Fase 0.75 — Distribución (solo tras confirmación)

- [ ] Decidir Chrome Web Store y Edge Add-ons.
- [ ] Comprobar la distribución para Brave.
- [ ] Definir IDs, actualizaciones, metadatos e iconos definitivos.
- [ ] Preparar política de privacidad si fuese necesaria.

## Fase 1 — Microsoft To Do en lectura

- [x] Registrar la aplicación en Microsoft Entra.
- [ ] Incorporar el Client ID público y validar redirects SPA reales en localhost y GitHub Pages.
- [x] Implementar cliente público con Authorization Code + PKCE.
- [x] Conectar/desconectar cuenta sin client secret.
- [x] Solicitar únicamente `Tasks.Read`.
- [x] Leer listas, tareas, vencimientos y recordatorios.
- [x] Integrar datos normalizados en dashboard y calendario.
- [x] Filtrar el panel por una lista seleccionada sin limitar el calendario unificado.
- [ ] Configurar un Client ID real y completar pruebas con cuentas Microsoft en la web desplegada.

## Fase 2 — Edición de Microsoft To Do

- [x] Elevar a `Tasks.ReadWrite` al incorporar la primera función de escritura.
- [x] Completar y reabrir tareas.
- [x] Crear tareas en la lista seleccionada.
- [x] Modificar título e importancia y eliminar tareas con confirmación.
- [x] Editar fechas y recordatorios.
- [x] Mantener una caché temporal de sesión para reducir llamadas repetidas a Graph.

## Fase 3 — Google Calendar

- [ ] Registrar/configurar la aplicación y OAuth web.
- [ ] Empezar con permisos de lectura.
- [ ] Leer calendarios y eventos por intervalo.
- [ ] Integrar eventos en el calendario unificado.

## Fase 4 — Productividad

- [x] Permitir una imagen de fondo local configurable.
- [x] Usar confirmaciones propias para completar y eliminar tareas.
- [x] Mantener la sesión de Microsoft entre reinicios mediante renovación segura.
- [x] Reordenar accesos directos mediante arrastre y controles accesibles.
- [x] Mostrar el favicon asociado por el navegador a cada URL, con fallback local y sin servicios externos.
- [x] Filtrar las tareas para mostrar únicamente las vencidas por fecha o recordatorio.
- [x] Editar y eliminar accesos desde un menú contextual con confirmación.
- [x] Abrir las acciones de un acceso con pulsación prolongada en móvil y mediante teclado.
- [x] Colocar las tareas completadas al final, conservando el orden por aviso o vencimiento dentro de cada grupo.
- [x] Mostrar los filtros debajo del calendario, eventos con el color de su calendario y recordatorios sin relleno.
- [x] Permitir seleccionar o subir un icono personalizado para cada acceso directo.
- [ ] Vistas semanal y agenda, filtros, búsqueda y personalización avanzada.
- [x] Importación/exportación de accesos, iconos, fondo y selecciones mediante JSON versionado, con vista previa, confirmación y recuperación ante errores de almacenamiento.

## Fase 5 — Sincronización propia opcional

- [ ] Evaluarla solo si los mecanismos de cada navegador no cubren las necesidades.

## Fase 6 — Backend seguro e integración híbrida

- [x] Decidir arquitectura híbrida SPA/extensión + Supabase.
- [x] Documentar separación entre configuración pública y secretos de servidor.
- [x] Crear proyecto Supabase y configurar Auth.
- [ ] Registrar el callback web del backend en Microsoft Entra.
- [ ] Implementar Edge Function de autorización Microsoft.
- [x] Implementar Edge Function protegida para Microsoft Graph.
- [x] Preparar almacén cifrado de credenciales de renovación para Microsoft.
- [ ] Aplicar la migración, configurar secretos del vault y validar la renovación servidor a servidor.
- [ ] Activar Graph mediante Edge Function tras resolver su respuesta pendiente en producción.
- [x] Añadir adaptador frontend con fallback MSAL durante la transición.
- [x] Verificar persistencia de sesión al cerrar y abrir el navegador.
- [x] Restaurar Microsoft sin exigir tokens Azure en el navegador, proteger el vault frente a sesiones antiguas/Google y diferenciar errores de renovación.
- [ ] Reutilizar el backend desde el empaquetado Chromium.

Electron, Tauri, PWA, Firefox y Safari no forman parte del roadmap actual.
