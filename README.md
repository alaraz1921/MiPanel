# MiPanel

MiPanel es una extensión Chromium Manifest V3 para escritorio que sustituye la página de nueva pestaña por un panel personal de productividad. Una única base React + TypeScript + Vite sirve para Google Chrome, Brave y Microsoft Edge.

La versión actual mantiene datos de demostración: buscador web, reloj, accesos directos configurables, tareas y calendario mensual. Microsoft To Do y Google Calendar se integrarán en fases posteriores; todavía no existe OAuth, backend propio ni sincronización cloud entre navegadores.

## Requisitos de desarrollo

- Node.js 20.19+ o 22.12+ (se recomienda Node 22 LTS).
- npm.
- Chrome, Brave o Edge de escritorio para probar la extensión.

## Compilar e instalar

```powershell
cd V:\Proyectos\Git\MiPanel
npm ci
npm run typecheck
npm run build
```

El resultado instalable queda en `dist/`. No se versiona.

1. Abre `chrome://extensions`, `brave://extensions` o `edge://extensions`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona `V:\Proyectos\Git\MiPanel\dist`.
5. Abre una nueva pestaña.

`npm run dev` sigue disponible únicamente como ayuda de desarrollo visual. La extensión instalada no depende de localhost ni de GitHub Pages.

## Persistencia

La extensión guarda `mipanel.shortcuts` y `mipanel.mockTasks` en `chrome.storage.local`. La capa de almacenamiento mantiene sincronizados los componentes que consumen la misma clave. Durante `npm run dev`, donde la API de extensión no existe, usa `localStorage` como respaldo de desarrollo.

No existe migración automática desde el antiguo origen localhost: ambos orígenes están aislados. `chrome.storage.sync` no se usa en esta fase y, si se estudia más adelante, solo servirá para preferencias pequeñas y no sensibles; no proporciona sincronización universal entre Chrome, Brave y Edge.

## Seguridad y CI

- El manifiesto solo solicita `storage`.
- No hay `identity`, permisos de host, content scripts ni service worker.
- Todo JavaScript se empaqueta localmente; no hay scripts remotos.
- Las variables `VITE_*` son públicas porque terminan en el bundle. Nunca deben contener secretos.
- `.github/workflows/ci-extension.yml` ejecuta `npm ci`, typecheck y build, valida los archivos esenciales y publica un artifact ZIP con `manifest.json` en su raíz.

GitHub es la fuente principal: <https://github.com/alaraz1921/MiPanel>. Esta carpeta es únicamente la copia de trabajo local.
