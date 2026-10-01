# Instrucciones para agentes de desarrollo (Codex)

Antes de modificar el repositorio, leer `docs/ESPECIFICACION_MIPANEL.md` y `docs/ROADMAP.md`.

## Principios

- MiPanel es una extensión Chromium Manifest V3 de escritorio para Chrome, Brave y Edge.
- Mantener una única base React + TypeScript + Vite con `strict: true`.
- La aplicación compilada debe funcionar desde `dist/` sin localhost ni GitHub Pages.
- Mantener `base: './'` y evitar rutas absolutas incompatibles con `chrome-extension://`.
- Aplicar mínimo privilegio en el manifiesto; no añadir permisos preventivos.
- Evitar dependencias innecesarias y conservar la interfaz, accesibilidad, teclado y responsive.
- Mantener separadas las integraciones en `src/integrations/microsoft` y `src/integrations/google`.
- Normalizar tareas y eventos antes de mostrarlos; no acoplar el calendario a un proveedor.
- No almacenar contraseñas, client secrets, tokens ni claves privadas.
- Recordar que toda variable `VITE_*` es visible en el bundle.
- La extensión debe seguir funcionando en modo demo sin cuentas conectadas.
- No añadir Electron, Tauri, PWA, backend ni publicación en tiendas sin petición expresa.

## Antes de finalizar un cambio

Ejecutar:

```bash
npm run typecheck
npm run build
```

Si cambia el empaquetado, comprobar `dist/manifest.json`, `dist/index.html` y probar `dist/` como extensión desempaquetada. Indicar claramente cualquier navegador o integración no probados de forma real.

## Flujo de trabajo

Hacer cambios pequeños por fase y actualizar `docs/ROADMAP.md` al completar hitos. Microsoft y Google se implementan en fases separadas y con el permiso mínimo necesario.
