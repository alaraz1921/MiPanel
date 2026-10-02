# Instrucciones para agentes de desarrollo (Codex)

Antes de modificar el repositorio, leer `docs/ESPECIFICACION_MIPANEL.md` y `docs/ROADMAP.md`.

## Principios

- MiPanel es una aplicación web SPA para navegadores modernos.
- Mantener una única base React + TypeScript + Vite con `strict: true`.
- La aplicación compilada debe funcionar desde `dist/` en un hosting estático, sin depender de localhost en producción.
- Mantener una configuración Vite compatible con la URL web de despliegue.
- No añadir dependencias ni permisos de navegador preventivos.
- Evitar dependencias innecesarias y conservar la interfaz, accesibilidad, teclado y responsive.
- Mantener separadas las integraciones en `src/integrations/microsoft` y `src/integrations/google`.
- Normalizar tareas y eventos antes de mostrarlos; no acoplar el calendario a un proveedor.
- No almacenar contraseñas, client secrets, tokens ni claves privadas.
- Recordar que toda variable `VITE_*` es visible en el bundle.
- La aplicación web debe seguir funcionando en modo demo sin cuentas conectadas.
- No añadir Electron, Tauri, PWA, backend ni publicación en tiendas sin petición expresa.

## Antes de finalizar un cambio

Ejecutar:

```bash
npm run typecheck
npm run build
```

Si cambia el empaquetado, comprobar `dist/index.html` y `dist/assets/`. Indicar claramente cualquier navegador o integración no probados de forma real.

## Flujo de trabajo

Hacer cambios pequeños por fase y actualizar `docs/ROADMAP.md` al completar hitos. Microsoft y Google se implementan en fases separadas y con el permiso mínimo necesario.
