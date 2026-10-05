# MiPanel

MiPanel es una aplicación web SPA de productividad desarrollada con React, TypeScript y Vite. Se despliega como un sitio estático y funciona en navegadores modernos, incluidos Chrome, Edge, Brave, Firefox y Safari.

La versión actual mantiene buscador, reloj, accesos directos reordenables, fondo configurable y calendario mensual. Al conectar Microsoft To Do permite elegir una lista y crear, completar, reabrir, editar o eliminar sus tareas; completar y eliminar requieren confirmación mediante diálogos propios. Sin una cuenta conectada no muestra tareas ni eventos ficticios. El calendario conserva los vencimientos y recordatorios pendientes de todas las listas. Google Calendar se integrará en una fase posterior. El backend Supabase de la arquitectura híbrida está planificado, pero todavía no está implementado.

La decisión y el orden de trabajo del backend están documentados en
[`docs/ARQUITECTURA_HIBRIDA.md`](docs/ARQUITECTURA_HIBRIDA.md). Hasta completar esa
fase, el frontend continúa utilizando MSAL Browser directamente como fallback.

## Requisitos de desarrollo

- Node.js 20.19+ o 22.12+ (se recomienda Node 22 LTS).
- npm.
- Un navegador moderno para probar la SPA.

## Desarrollo y build web

```powershell
cd V:\Proyectos\Git\MiPanel
npm ci
npm run typecheck
npm run build
```

`npm run dev` inicia la web en `http://localhost:5173`. `npm run build` genera una SPA estática en `dist/`, lista para desplegarse en un hosting convencional. No requiere extensión, Manifest V3 ni localhost en producción.

## Publicación en GitHub Pages

El workflow [deploy-pages.yml](.github/workflows/deploy-pages.yml) publica la rama `main` en `https://alaraz1921.github.io/MiPanel/`. En el repositorio, activa una sola vez **Settings → Pages → Build and deployment → Source: GitHub Actions**. Cada push posterior a `main` ejecuta `npm run build:pages`, que fija la ruta pública `/MiPanel/`, y la despliega.

Para incluir Microsoft To Do en el build publicado, crea en **Settings → Secrets and variables → Actions → Variables** la variable `MICROSOFT_CLIENT_ID` con el Client ID de Entra. Opcionalmente crea `MICROSOFT_TENANT` (`common` por defecto). Son valores públicos de una SPA, no secretos. Sin `MICROSOFT_CLIENT_ID`, la página se publica pero no puede cargar tareas remotas.

## Persistencia local

Las preferencias propias se guardan en `localStorage` del navegador y quedan limitadas al origen donde se ejecute MiPanel: accesos directos, imagen de fondo y lista seleccionada. La caché temporal de listas y tareas de Microsoft usa `sessionStorage` durante dos minutos.

No existe migración automática desde los datos de la antigua extensión: `chrome.storage.local` y el origen de la web están aislados. Una importación/exportación explícita podrá resolverlo en una fase posterior.

Los accesos directos utilizan el favicon web convencional de cada dominio. El favicon dinámico que proporcionaba Chromium a la antigua extensión no forma parte de las APIs web estándar.

## Microsoft To Do — configuración

La integración usa Supabase Auth con Azure cuando `VITE_SUPABASE_URL` y
`VITE_SUPABASE_ANON_KEY` están configuradas. MSAL Browser se conserva como
fallback local. El permiso delegado `Tasks.ReadWrite` es necesario para editar
tareas. MiPanel no escribe manualmente client secrets ni refresh tokens.

En Supabase, en **Authentication → URL Configuration**, registra:

```text
Site URL: https://alaraz1921.github.io/MiPanel/
Additional Redirect URLs:
https://alaraz1921.github.io/MiPanel/
http://localhost:5173/
```

La integración solicita `openid profile email offline_access` y
`https://graph.microsoft.com/Tasks.ReadWrite`. El SDK de Supabase administra la
sesión persistente del usuario; la siguiente etapa trasladará las llamadas de
Graph a Edge Functions para que el frontend no tenga que utilizarlas
directamente.

La aplicación se registra y configura una sola vez por el desarrollador. Esa configuración técnica no se solicita a cada usuario.

1. En Microsoft Entra abre **Identidad > Aplicaciones > Registros de aplicaciones > MiPanel > Autenticación**. Añade una plataforma **Aplicación de página única (SPA)** y registra:

   ```text
   http://localhost:5173/microsoft-auth-redirect.html
   https://alaraz1921.github.io/MiPanel/microsoft-auth-redirect.html
   ```

   Si se usa un dominio propio, sustituye el segundo valor por su URL HTTPS exacta terminada en `microsoft-auth-redirect.html`. Conserva los redirects de extensión antiguos mientras sigan siendo necesarios.

2. Añade Microsoft Graph → permisos delegados → `Tasks.ReadWrite`.
3. Crea `.env.local` con la configuración pública de la aplicación:

   ```dotenv
   VITE_MICROSOFT_CLIENT_ID=<application-client-id>
   VITE_MICROSOFT_TENANT=common
   # Opcional; por defecto se calcula desde la URL actual y la ruta base.
   VITE_MICROSOFT_REDIRECT_URI=
   ```

4. Ejecuta `npm run dev` y pulsa **Conectar Microsoft**. El usuario verá el selector o formulario de identificación de Microsoft en una ventana emergente.

Configurar el permiso en Entra permite que la aplicación lo solicite, pero no actualiza los tokens ya emitidos. Tras cambiar permisos, desconecta y vuelve a conectar la cuenta para renovar el consentimiento.

MSAL mantiene su caché para compartir sesión entre pestañas. Al cerrarse por completo el navegador, MiPanel conserva únicamente el identificador de la última cuenta e intenta restaurar la sesión de forma silenciosa; no escribe access tokens ni refresh tokens por su cuenta. El resultado depende de que la sesión de Microsoft siga activa y de que el navegador permita esa comprobación. **Desconectar** elimina tanto la caché de MSAL como ese identificador local. MiPanel nunca solicita contraseñas ni client secrets.

Al pulsar **Conectar Microsoft**, la ventana de Microsoft reutiliza su sesión web existente cuando está disponible; no se fuerza un selector de cuenta ni se vuelven a pedir credenciales salvo que la sesión de Microsoft haya caducado.

La URL de redirect debe estar registrada como tipo **SPA**, tanto para localhost como para producción. Si no se configura así, Microsoft bloqueará el intercambio de código por CORS.

## Seguridad y CI

- No existe manifiesto ni permisos de extensión.
- La escritura se limita a las operaciones de tareas documentadas mediante Microsoft Graph.
- Todo JavaScript se empaqueta localmente; no hay scripts remotos.
- Las variables `VITE_*` son públicas porque terminan en el bundle. Nunca deben contener secretos.
- MiPanel no escribe refresh tokens en `localStorage`, `sessionStorage` ni Git.
- `.github/workflows/ci-extension.yml` ejecuta `npm ci`, typecheck y build y valida `dist/index.html` y `dist/assets/`.

Cuando se implemente la arquitectura híbrida, los secretos de Microsoft se
configurarán únicamente en Supabase Edge Functions. Nunca se incluirán en
variables `VITE_*`, Git o el bundle.

GitHub es la fuente principal: <https://github.com/alaraz1921/MiPanel>. Esta carpeta es únicamente la copia de trabajo local.
