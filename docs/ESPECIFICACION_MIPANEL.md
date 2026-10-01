# Especificación funcional y técnica — MiPanel

**Versión:** 0.3
**Fecha:** 01/10/2026
**Estado:** extensión Chromium Manifest V3 con modo demo

## 1. Visión

MiPanel es una extensión Chromium Manifest V3 de escritorio que sustituye la página de nueva pestaña en Google Chrome, Brave y Microsoft Edge. Mantiene una única interfaz React + TypeScript + Vite y evolucionará para consultar Microsoft To Do y Google Calendar sin abandonar el modo demo.

GitHub es la fuente del proyecto; `V:\Proyectos\Git\MiPanel` es la copia de trabajo local. La extensión se compila en `dist/` y no depende de localhost, GitHub Pages ni un backend propio para funcionar.

## 2. Objetivos principales

1. Abrir MiPanel automáticamente al crear una pestaña nueva.
2. Mostrar un dashboard agradable, rápido y configurable.
3. Conectar Microsoft To Do mediante Microsoft Graph desde la propia interfaz.
4. Empezar con lectura y habilitar edición solo en una fase separada.
5. Representar en calendario las tareas con fecha de vencimiento y/o recordatorio.
6. Conectar Google Calendar y superponer sus eventos en el mismo calendario.
7. Diferenciar visualmente eventos, vencimientos y recordatorios.
8. Mantener accesos directos web propios, editables y reordenables.
9. Mantener un paquete común compatible con Chrome, Brave y Edge.
10. Aplicar mínimo privilegio y no incluir secretos en la extensión.

## 3. No objetivos iniciales

- Sustituir por completo a Microsoft To Do o Google Calendar.
- Sincronizar o copiar datos entre Microsoft y Google.
- Leer automáticamente los marcadores internos de Brave/Chrome en la primera versión.
- Ejecutar un servidor público o local para usar la extensión compilada.
- Guardar contraseñas de Microsoft o Google.
- Implementar colaboración multiusuario.
- Convertir el producto en Electron, Tauri o PWA.
- Publicar automáticamente en tiendas de extensiones.

## 4. Experiencia de usuario

### 4.1 Página de inicio

Debe recordar visualmente a una nueva pestaña moderna: reloj y fecha, fondo configurable, buscador grande, accesos directos, tareas próximas y calendario.

El diseño de referencia aportado por el usuario sirve como inspiración de composición, no como copia literal.

### 4.2 Accesos directos

Cada acceso tendrá inicialmente:

- nombre;
- URL;
- icono o favicon en una fase posterior;
- orden;
- opción de eliminar/editar.

Los accesos son datos propios de MiPanel. No dependen de los favoritos del navegador.

### 4.3 Microsoft To Do

La Fase 1 implementa en modo de solo lectura:

- iniciar sesión con Microsoft;
- leer las listas de To Do;
- leer tareas;
- seleccionar la lista visible en el panel de tareas, manteniendo todas en el calendario;
- mostrar vencimientos y recordatorios en el calendario;
- actualizar bajo demanda;
- desconectar la sesión local.

La Fase 2 añadirá:

- crear tareas;
- modificar título, estado, importancia, vencimiento y recordatorio;
- completar/reabrir tareas;
- eliminar tareas si se habilita la acción en UI;
- mostrar notas y recurrencia en una fase posterior;
- reflejar los cambios en Microsoft To Do real.

El calendario debe poder representar por separado:

- `dueDateTime` como **vencimiento**;
- `reminderDateTime` como **recordatorio**.

Si ambos caen en fechas distintas, una misma tarea puede generar dos representaciones visuales en el calendario.

### 4.4 Google Calendar

Debe permitir conectar una cuenta Google y:

- listar calendarios disponibles;
- activar/desactivar su visibilidad;
- leer eventos dentro del intervalo mostrado;
- mostrar eventos junto con To Do;
- conservar la procedencia del evento;
- empezar con permisos de solo lectura;
- valorar la edición de eventos solo cuando la lectura esté estable.

### 4.5 Calendario unificado

La UI trabajará con un modelo interno común, por ejemplo:

```ts
type UnifiedCalendarEntry = {
  id: string;
  source: 'microsoft-todo' | 'google-calendar';
  kind: 'due' | 'reminder' | 'event';
  title: string;
  date: string;
  time?: string;
  sourceContainerId?: string;
};
```

La UI no debe depender directamente del JSON de Microsoft Graph ni de Google Calendar.

Vistas previstas:

- mensual — prioritaria;
- semanal — posterior;
- agenda — posterior.

### 4.6 Estados de conexión

El usuario debe poder ver claramente:

- Microsoft: conectado / desconectado / error;
- Google: conectado / desconectado / error;
- última actualización si procede.

La aplicación debe seguir siendo utilizable como dashboard cuando no haya ninguna cuenta conectada.

## 5. Arquitectura inicial

### 5.1 Frontend

- React.
- TypeScript estricto.
- Vite para desarrollo y build con `base: './'`.
- Manifest V3 en `public/manifest.json`, copiado a la raíz de `dist/`.
- `chrome_url_overrides.newtab` apunta a `index.html`.
- CSS propio inicialmente para reducir dependencias.
- Permisos `storage` e `identity`.
- Host permissions limitados a Microsoft Login y Microsoft Graph.
- Sin router, service worker, content scripts ni código remoto mientras no sean necesarios.

### 5.2 Integraciones

Separar por proveedor:

```text
src/integrations/
├── microsoft/
└── google/
```

Cada integración deberá encargarse de:

- autenticación;
- llamadas a API;
- conversión a modelos internos;
- errores del proveedor.

### 5.3 Almacenamiento local

- `chrome.storage.local` es el almacenamiento principal de accesos, tareas demo y preferencias locales.
- Las claves actuales son `mipanel.shortcuts`, `mipanel.mockTasks` y `mipanel.microsoft.selectedListId`.
- La abstracción compartida notifica a todos los componentes que consumen una misma clave.
- `localStorage` solo es respaldo de `npm run dev`, donde no existe la API de extensión.
- No existe migración automática desde el antiguo origen localhost; una recuperación futura será mediante exportación/importación explícita.
- `chrome.storage.sync` no se usa en esta fase. Si se adopta, será únicamente para configuración pequeña y no sensible; no equivale a sincronización universal entre navegadores.

### 5.4 Backend

No existe backend propio. Las futuras integraciones tratarán la extensión como cliente público y usarán Authorization Code + PKCE y las APIs de identidad adecuadas. Añadir un backend requerirá una necesidad técnica demostrable y una decisión explícita.

## 6. Microsoft To Do — diseño técnico

API: Microsoft Graph v1.0.

Operaciones base:

```text
GET   /me/todo/lists
GET   /me/todo/lists/{todoTaskListId}/tasks
POST  /me/todo/lists/{todoTaskListId}/tasks
PATCH /me/todo/lists/{todoTaskListId}/tasks/{todoTaskId}
```

Permiso delegado de la Fase 2:

```text
Tasks.ReadWrite
```

`Tasks.ReadWrite` se solicita al existir ya la función de completar y reabrir tareas. Se utiliza autenticación interactiva y autorización del usuario; no se guardan credenciales.

Para sincronización incremental se valorará:

```text
GET /me/todo/lists/{todoTaskListId}/tasks/delta
```

Debe conservarse la URL `@odata.deltaLink` devuelta por Microsoft si se implementa caché/sincronización local.

## 7. Google Calendar — diseño técnico

API: Google Calendar API.

Primera fase recomendada: solo lectura, usando el menor alcance necesario. Scopes candidatos:

```text
https://www.googleapis.com/auth/calendar.events.readonly
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

Si se habilita edición posteriormente:

```text
https://www.googleapis.com/auth/calendar.events
```

No solicitar permisos de escritura hasta que haya una función concreta que los requiera.

## 8. Configuración OAuth

Microsoft OAuth está implementado como cliente público mediante Authorization Code + PKCE y `chrome.identity.launchWebAuthFlow`. La extensión no puede proteger un client secret y no incluye ninguno.

`chrome.identity.getRedirectURL('microsoft')` genera un redirect dependiente del ID de la extensión. Chrome Web Store y Edge Add-ons pueden asignar IDs distintos, por lo que cada distribución debe registrar sus redirects reales.

### Microsoft

El registro en Microsoft Entra es configuración técnica previa y no forma parte de la identificación del usuario. El Client ID y tenant públicos se incorporan a la compilación mediante:

```text
VITE_MICROSOFT_CLIENT_ID=
VITE_MICROSOFT_TENANT=common
```

La app registrada en Microsoft Entra deberá admitir las URI de redirección de los IDs reales de extensión.

El token de acceso se guarda únicamente en `chrome.storage.session`, que reside en memoria. No se solicita `offline_access` ni se persiste un refresh token en esta fase. Al caducar la sesión se solicita al usuario conectar de nuevo.

### Google

Variables previstas:

```text
VITE_GOOGLE_CLIENT_ID=
```

En Google Cloud deberá configurarse el consentimiento OAuth y los redirects de extensión necesarios para la implementación elegida. Una API key pública solo se añadirá si existe una necesidad concreta y con restricciones documentadas.

Toda variable `VITE_*` se incluye en el bundle y es visible: solo puede contener identificadores o configuración pública, nunca secretos.

## 9. Seguridad

- No incluir `.env.local` en Git.
- No usar client secrets en código de navegador.
- No guardar tokens sensibles en `chrome.storage.sync`.
- Solicitar permisos mínimos.
- No registrar tokens en consola.
- No almacenar contraseñas.
- Evitar persistir datos de calendario/tareas más allá de lo necesario.
- Separar claramente datos locales de datos remotos.
- Añadir confirmación antes de borrados destructivos.
- Empaquetar todo el JavaScript; no usar `eval`, `new Function` ni scripts remotos.
- Mantener el manifiesto con el mínimo permiso necesario.

## 10. Compilación, instalación y distribución

El producto principal es una única extensión Chromium:

1. `npm run build` genera `dist/` con `manifest.json`, `index.html` y assets relativos.
2. `dist/` se carga como extensión desempaquetada en Chrome, Brave o Edge.
3. GitHub Actions valida el proyecto y crea `MiPanel-extension.zip` con `manifest.json` en la raíz.
4. `npm run dev` se conserva solo para desarrollo visual opcional.

GitHub Pages no es requisito ni destino principal. La publicación en Chrome Web Store o Edge Add-ons se decidirá en la Fase 0.75 y nunca será automática desde este repositorio.

## 11. Datos locales previstos

Preferencias que MiPanel puede guardar localmente:

- accesos directos;
- orden de accesos;
- fondo/tema;
- buscador preferido;
- módulos visibles;
- listas To Do visibles;
- calendarios Google visibles;
- vista de calendario elegida;
- ajustes visuales.

Los datos maestros de tareas/eventos siguen perteneciendo a Microsoft/Google.

## 12. Modelo interno sugerido

```ts
type Provider = 'microsoft' | 'google';

type TodoTask = {
  id: string;
  provider: 'microsoft';
  listId: string;
  listName: string;
  title: string;
  completed: boolean;
  important: boolean;
  dueDate?: string;
  reminderDateTime?: string;
  notes?: string;
};

type CalendarEvent = {
  id: string;
  provider: 'google';
  calendarId: string;
  calendarName: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
};
```

Los adaptadores de proveedor pueden convertir estos objetos a `UnifiedCalendarEntry` para la UI.

## 13. Rendimiento

- No recargar todos los datos innecesariamente.
- En Microsoft, usar delta cuando la integración base sea estable.
- En Google, pedir eventos únicamente para el intervalo visible + un margen razonable.
- Evitar dependencias grandes para funciones sencillas.
- El dashboard debe abrir rápido aunque las APIs aún estén cargando.

## 14. Gestión de errores

La UI debe distinguir:

- sin configurar;
- no autenticado;
- token caducado/consentimiento requerido;
- sin red;
- API temporalmente no disponible;
- error de datos.

Nunca ocultar un fallo remoto sustituyéndolo silenciosamente por datos demo sin indicarlo.

## 15. Fases de implementación

Consultar `ROADMAP.md`. Orden preferente:

1. base visual;
2. conversión a extensión Chromium;
3. distribución, solo tras confirmación;
4. Microsoft To Do en lectura;
5. edición de Microsoft To Do;
6. Google Calendar;
7. UX avanzada y sincronización opcional de configuración.

## 16. Criterios de aceptación para la primera versión útil

La Fase 0.5 puede considerarse completa cuando:

- `dist/` se carga sin errores como Manifest V3;
- una pestaña nueva abre MiPanel en Chrome, Brave y Edge;
- CSS, JavaScript y recursos usan rutas relativas y no dependen de localhost o GitHub Pages;
- buscador, accesos, reloj, tareas demo, calendario y responsive siguen funcionando;
- accesos y tareas persisten en `chrome.storage.local`;
- cambios de tareas se reflejan inmediatamente en el calendario;
- el manifiesto solo solicita `storage` y no incluye OAuth, `identity`, host permissions, content scripts ni service worker;
- CI ejecuta `npm ci`, typecheck y build y genera un ZIP instalable;
- las pruebas reales pendientes se documentan sin afirmar resultados no comprobados.

La Fase 1 queda lista para validación real cuando:

- el manifiesto solo añade `identity` y los hosts concretos de Microsoft;
- el flujo usa PKCE, state y no incluye client secret;
- durante la Fase 1 solo se solicita `Tasks.Read` y la Fase 2 documenta el cambio a `Tasks.ReadWrite`;
- listas y tareas se normalizan a los tipos internos;
- vencimientos y recordatorios aparecen en el calendario;
- sin Client ID o sin sesión se mantiene el modo demo;
- cuando la aplicación está configurada, **Conectar Microsoft** abre directamente la identificación interactiva;
- los tokens no se escriben en `localStorage`, `chrome.storage.local` ni `chrome.storage.sync`;
- un Client ID y redirects reales permiten completar pruebas en Chrome, Brave y Edge.

## 17. Referencias oficiales

Microsoft Graph — To Do API overview:
https://learn.microsoft.com/en-us/graph/api/resources/todo-overview?view=graph-rest-1.0

Microsoft Graph — todoTask resource:
https://learn.microsoft.com/en-us/graph/api/resources/todotask?view=graph-rest-1.0

Microsoft Graph — task delta:
https://learn.microsoft.com/en-us/graph/api/todotask-delta?view=graph-rest-1.0

Google Calendar API — OAuth scopes:
https://developers.google.com/workspace/calendar/api/auth

Google Calendar API — JavaScript quickstart:
https://developers.google.com/workspace/calendar/api/quickstart/js

Chrome Extensions — Identity API:
https://developer.chrome.com/docs/extensions/reference/api/identity

Chrome Extensions — Storage API:
https://developer.chrome.com/docs/extensions/reference/api/storage
