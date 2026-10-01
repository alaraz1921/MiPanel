# MiPanel

MiPanel es una extensión Chromium Manifest V3 para escritorio que sustituye la página de nueva pestaña por un panel personal de productividad. Una única base React + TypeScript + Vite sirve para Google Chrome, Brave y Microsoft Edge.

La versión actual mantiene buscador, reloj, accesos directos y calendario mensual. Puede funcionar completamente en modo demo o conectar Microsoft To Do en modo de solo lectura. Google Calendar se integrará en una fase posterior; no existe backend propio ni sincronización cloud entre navegadores.

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

La extensión guarda `mipanel.shortcuts` y `mipanel.mockTasks` en `chrome.storage.local`. La capa de almacenamiento mantiene sincronizados los componentes que consumen la misma clave. Durante `npm run dev`, donde la API de extensión no existe, usa `localStorage` como respaldo de desarrollo para los datos locales del panel.

No existe migración automática desde el antiguo origen localhost: ambos orígenes están aislados. `chrome.storage.sync` no se usa en esta fase y, si se estudia más adelante, solo servirá para preferencias pequeñas y no sensibles; no proporciona sincronización universal entre Chrome, Brave y Edge.

## Microsoft To Do — configuración de lectura

La integración usa Authorization Code + PKCE, `chrome.identity` y el permiso delegado mínimo `Tasks.Read`. No utiliza client secret, permisos de escritura ni refresh tokens persistentes.

La aplicación se registra y configura una sola vez por el desarrollador. Esa configuración técnica no se solicita a cada usuario.

1. En Microsoft Entra registra una aplicación compatible con los tipos de cuenta que quieras admitir y añade como plataforma **Aplicación de página única (SPA)** el redirect de la extensión:

   ```text
   https://<ID_DE_LA_EXTENSION>.chromiumapp.org/microsoft
   ```

2. Añade Microsoft Graph → permisos delegados → `Tasks.Read`.
3. Crea `.env.local` con la configuración pública de la aplicación:

   ```dotenv
   VITE_MICROSOFT_CLIENT_ID=<application-client-id>
   VITE_MICROSOFT_TENANT=common
   ```

4. Ejecuta `npm run typecheck` y `npm run build`, recarga la extensión y pulsa **Conectar Microsoft**. El usuario verá directamente el selector o formulario de identificación de Microsoft.

El token se guarda únicamente en `chrome.storage.session`. MiPanel nunca solicita contraseñas ni client secrets.

Chrome Web Store y Edge Add-ons pueden asignar IDs diferentes. Registra cada redirect real antes de probar esa distribución. La sesión se guarda en `chrome.storage.session`, solo en memoria, y puede requerir reconexión cuando caduque o se reinicie el navegador.

## Seguridad y CI

- El manifiesto solicita `storage` e `identity`.
- Los únicos hosts permitidos son Microsoft Graph y Microsoft Login.
- No hay permisos de escritura, content scripts ni service worker.
- Todo JavaScript se empaqueta localmente; no hay scripts remotos.
- Las variables `VITE_*` son públicas porque terminan en el bundle. Nunca deben contener secretos.
- `.github/workflows/ci-extension.yml` ejecuta `npm ci`, typecheck y build, valida los archivos esenciales y publica un artifact ZIP con `manifest.json` en su raíz.

GitHub es la fuente principal: <https://github.com/alaraz1921/MiPanel>. Esta carpeta es únicamente la copia de trabajo local.
