# Especificación funcional y técnica — MiPanel

**Versión:** 0.6
**Fecha:** 02/10/2026
**Estado:** aplicación web SPA

## 1. Visión

MiPanel es una aplicación web SPA de escritorio que se sirve desde una URL HTTP/HTTPS. Mantiene una única interfaz React + TypeScript + Vite y evolucionará para consultar Microsoft To Do y Google Calendar sin requerir cuentas conectadas para usar el resto del panel.

GitHub es la fuente del proyecto; `V:\Proyectos\Git\MiPanel` es la copia de trabajo local. La web se compila en `dist/` y se puede desplegar en cualquier hosting estático HTTPS, sin backend propio.

## 2. Objetivos principales

1. Abrir MiPanel directamente desde una URL en un navegador moderno.
2. Mostrar un dashboard agradable, rápido y configurable.
3. Conectar Microsoft To Do mediante Microsoft Graph desde la propia interfaz.
4. Empezar con lectura y habilitar edición solo en una fase separada.
5. Representar en calendario las tareas con fecha de vencimiento y/o recordatorio.
6. Conectar Google Calendar y superponer sus eventos en el mismo calendario.
7. Diferenciar visualmente eventos, vencimientos y recordatorios.
8. Mantener accesos directos web propios, editables y reordenables.
9. Mantener una SPA compatible con Chrome, Brave, Edge, Firefox y Safari.
10. Aplicar mínimo privilegio y no incluir secretos en el navegador.

## 3. No objetivos iniciales

- Sustituir por completo a Microsoft To Do o Google Calendar.
- Sincronizar o copiar datos entre Microsoft y Google.
- Leer automáticamente los marcadores internos de Brave/Chrome en la primera versión.
- Ejecutar un backend propio para usar la aplicación web compilada.
- Guardar contraseñas de Microsoft o Google.
- Implementar colaboración multiusuario.
- Convertir el producto en Electron, Tauri o PWA.
- Publicar automáticamente en tiendas de extensiones.

## 4. Experiencia de usuario

### 4.1 Página de inicio

Debe recordar visualmente a una nueva pestaña moderna: reloj y fecha, accesos directos antes del buscador, fondo configurable mediante una imagen local, tareas próximas y calendario.

Completar una tarea pendiente y eliminar una tarea requieren confirmación mediante diálogos propios de MiPanel, no mediante mensajes nativos del navegador.

El diseño de referencia aportado por el usuario sirve como inspiración de composición, no como copia literal.

### 4.2 Accesos directos

Cada acceso tendrá inicialmente:

- nombre;
- URL;
- favicon web convencional del dominio, con icono local alternativo;
- reordenación por arrastre y menú contextual;
- edición y eliminación desde un menú contextual, con confirmación previa al borrar.

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

La Fase 2 incluye:

- crear tareas;
- modificar título, estado, importancia, vencimiento y recordatorio;
- completar/reabrir tareas;
- eliminar tareas si se habilita la acción en UI;
- mostrar notas y recurrencia en una fase posterior;
- reflejar los cambios en Microsoft To Do real.

El editor usa una única **Fecha** y una **Hora** opcional: la fecha se guarda como vencimiento; si se indica además una hora, se guarda un recordatorio en esa misma fecha y hora.

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
- Vite para desarrollo y build con `base: '/'`.
- `npm run dev` usa `http://localhost:5173`.
- `npm run build` produce una SPA estática en `dist/`.
- CSS propio inicialmente para reducir dependencias.
- Sin permisos ni APIs exclusivas de extensión.
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

- `localStorage` es el almacenamiento principal de accesos y preferencias locales.
- Las claves actuales son `mipanel.shortcuts`, `mipanel.backgroundImage` y `mipanel.microsoft.selectedListId`.
- La abstracción compartida notifica a todos los componentes que consumen una misma clave.
- `sessionStorage` mantiene la caché efímera de Microsoft To Do durante dos minutos.
- No existe migración automática desde la antigua extensión; una recuperación futura será mediante exportación/importación explícita.

### 5.4 Backend

No existe backend propio. Las futuras integraciones tratarán la SPA como cliente público y usarán Authorization Code + PKCE y las APIs de identidad adecuadas. Añadir un backend requerirá una necesidad técnica demostrable y una decisión explícita.

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

Las listas y tareas se guardan en una caché de `sessionStorage` con una duración máxima de dos minutos. La caché evita lecturas completas repetidas al recargar la SPA, se actualiza después de cada escritura y se elimina al desconectar. No se persisten datos remotos en `localStorage`.

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

Microsoft OAuth está implementado como cliente público mediante MSAL Browser, Authorization Code + PKCE y una ventana emergente. La SPA no puede proteger un client secret y no incluye ninguno.

### Microsoft

El registro en Microsoft Entra es configuración técnica previa y no forma parte de la identificación del usuario. El Client ID y tenant públicos se incorporan a la compilación mediante:

```text
VITE_MICROSOFT_CLIENT_ID=
VITE_MICROSOFT_TENANT=common
```

La app registrada en Microsoft Entra deberá admitir las URI de redirección de tipo SPA para `http://localhost:5173/microsoft-auth-redirect.html` y `https://alaraz1921.github.io/MiPanel/microsoft-auth-redirect.html` mientras GitHub Pages sea el despliegue de producción. Esta página mínima incorpora el redirect bridge de MSAL para los flujos popup.

MSAL mantiene su caché para compartir sesión entre pestañas. Al cerrarse por completo el navegador, MiPanel conserva solo el identificador de la última cuenta e intenta restaurar la sesión mediante una redirección automática con `prompt=none`, sin pedir credenciales. MiPanel no persiste access tokens ni refresh tokens manualmente. Si la sesión de Microsoft ha caducado, se solicita conectar de nuevo. La acción **Desconectar** elimina la caché local de la aplicación y el identificador de cuenta.

### Google

Variables previstas:

```text
VITE_GOOGLE_CLIENT_ID=
```

En Google Cloud deberá configurarse el consentimiento OAuth y los redirects web necesarios para la implementación elegida. Una API key pública solo se añadirá si existe una necesidad concreta y con restricciones documentadas.

Toda variable `VITE_*` se incluye en el bundle y es visible: solo puede contener identificadores o configuración pública, nunca secretos.

## 9. Seguridad

- No incluir `.env.local` en Git.
- No usar client secrets en código de navegador.
- No guardar tokens manualmente fuera de la caché gestionada por MSAL.
- Solicitar permisos mínimos.
- No registrar tokens en consola.
- No almacenar contraseñas.
- Evitar persistir datos de calendario/tareas más allá de lo necesario.
- Separar claramente datos locales de datos remotos.
- Añadir confirmación antes de borrados destructivos.
- Empaquetar todo el JavaScript; no usar `eval`, `new Function` ni scripts remotos.
- Mantener el manifiesto con el mínimo permiso necesario.

## 10. Compilación, instalación y distribución

El producto principal es una SPA web:

1. `npm run build` genera `dist/` con `index.html` y assets web.
2. `dist/` se despliega en un hosting estático convencional.
3. GitHub Actions valida `index.html` y `assets/` tras compilar.
4. `npm run dev` inicia la SPA en `http://localhost:5173`.

GitHub Pages publica la rama `main` en `https://alaraz1921.github.io/MiPanel/` mediante un workflow. Una extensión Chromium opcional podrá construirse como wrapper separado si vuelve a ser necesaria.

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

Nunca ocultar un fallo remoto sustituyéndolo silenciosamente por datos ficticios.

## 15. Fases de implementación

Consultar `ROADMAP.md`. Orden preferente:

1. base visual;
2. conversión a aplicación web SPA;
3. distribución, solo tras confirmación;
4. Microsoft To Do en lectura;
5. edición de Microsoft To Do;
6. Google Calendar;
7. UX avanzada y sincronización opcional de configuración.

## 16. Criterios de aceptación para la primera versión útil

La aplicación web queda lista para validación real cuando:

- `dist/index.html` y `dist/assets/` se generan correctamente;
- MiPanel se abre desde una URL HTTP/HTTPS en navegadores modernos;
- buscador, accesos, reloj, calendario y responsive siguen funcionando;
- accesos y preferencias persisten en `localStorage`;
- cambios de tareas se reflejan inmediatamente en el calendario;
- CI ejecuta `npm ci`, typecheck y build sin validar manifiestos ni ZIPs de extensión;
- las pruebas reales pendientes se documentan sin afirmar resultados no comprobados.

Microsoft To Do queda listo para validación real cuando:

- el flujo MSAL Browser usa Authorization Code + PKCE sin client secret;
- el redirect URI está registrado como tipo SPA en Microsoft Entra;
- se solicita exclusivamente `Tasks.ReadWrite`, necesario para la edición actual;
- listas y tareas se normalizan a los tipos internos;
- vencimientos y recordatorios aparecen en el calendario;
- sin Client ID o sin sesión no se muestran tareas remotas ni datos ficticios;
- cuando la aplicación está configurada, **Conectar Microsoft** abre directamente la identificación interactiva;
- MiPanel no escribe access tokens ni refresh tokens manualmente;
- un Client ID y redirects SPA reales permiten completar pruebas en desarrollo y producción.

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

Microsoft identity platform — SPA and Authorization Code + PKCE:
https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

MSAL Browser — initialization:
https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization
