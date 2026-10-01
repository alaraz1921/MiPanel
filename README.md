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

La extensión guarda `mipanel.shortcuts`, `mipanel.mockTasks` y la configuración pública `mipanel.microsoft.config` en `chrome.storage.local`. La capa de almacenamiento mantiene sincronizados los componentes que consumen la misma clave. Durante `npm run dev`, donde la API de extensión no existe, usa `localStorage` como respaldo de desarrollo para los datos locales del panel.

No existe migración automática desde el antiguo origen localhost: ambos orígenes están aislados. `chrome.storage.sync` no se usa en esta fase y, si se estudia más adelante, solo servirá para preferencias pequeñas y no sensibles; no proporciona sincronización universal entre Chrome, Brave y Edge.

## Microsoft To Do — configuración de lectura

La integración usa Authorization Code + PKCE, `chrome.identity` y el permiso delegado mínimo `Tasks.Read`. No utiliza client secret, permisos de escritura ni refresh tokens persistentes.

1. Carga `dist/` como extensión y abre una pestaña nueva.
2. Pulsa **Conectar Microsoft**. El diálogo muestra el redirect exacto y un acceso al registro de aplicaciones de Microsoft Entra.
3. En Microsoft Entra registra una aplicación compatible con los tipos de cuenta que quieras admitir y añade como plataforma **Aplicación de página única (SPA)** el redirect mostrado:

   ```text
   https://<ID_DE_LA_EXTENSION>.chromiumapp.org/microsoft
   ```

4. Añade Microsoft Graph → permisos delegados → `Tasks.Read`.
5. Copia el **Id. de aplicación (cliente)** en el diálogo, elige el tenant (`common` por defecto) y pulsa **Guardar y conectar**.

El Client ID y el tenant son configuración pública y se guardan en `chrome.storage.local`. El token se guarda únicamente en `chrome.storage.session`. El diálogo nunca solicita contraseñas, client secrets ni tokens.

Como alternativa para desarrolladores, `.env.local` puede definir valores públicos predeterminados en tiempo de compilación:

   ```dotenv
   VITE_MICROSOFT_CLIENT_ID=<application-client-id>
   VITE_MICROSOFT_TENANT=common
   ```

No es necesario recompilar para cambiar el Client ID desde la interfaz.

Chrome Web Store y Edge Add-ons pueden asignar IDs diferentes. Registra cada redirect real antes de probar esa distribución. La sesión se guarda en `chrome.storage.session`, solo en memoria, y puede requerir reconexión cuando caduque o se reinicie el navegador.

## Seguridad y CI

- El manifiesto solicita `storage` e `identity`.
- Los únicos hosts permitidos son Microsoft Graph y Microsoft Login.
- No hay permisos de escritura, content scripts ni service worker.
- Todo JavaScript se empaqueta localmente; no hay scripts remotos.
- Las variables `VITE_*` y la configuración introducida en el diálogo son públicas. Nunca deben contener secretos.
- `.github/workflows/ci-extension.yml` ejecuta `npm ci`, typecheck y build, valida los archivos esenciales y publica un artifact ZIP con `manifest.json` en su raíz.

GitHub es la fuente principal: <https://github.com/alaraz1921/MiPanel>. Esta carpeta es únicamente la copia de trabajo local.
