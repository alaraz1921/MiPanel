# Google Calendar con Supabase

MiPanel conecta Google Calendar como una identidad adicional de la sesión
existente de Supabase. Así, conectar Google no desconecta Microsoft To Do.

## Permisos

La primera versión solicita únicamente:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.events.readonly`

Desde la agenda de un día, **Autorizar edición** solicita `https://www.googleapis.com/auth/calendar.events` en lugar del alcance de eventos de solo lectura. Se conserva `calendar.calendarlist.readonly`; no se solicita administrar calendarios ni permisos de Google Tasks. Añade este alcance a la pantalla de consentimiento de Google Cloud si todavía no figura y acepta la nueva autorización desde MiPanel.

Las tarjetas de calendarios escribibles permiten editar título, fechas y horas o eliminar con confirmación. Los calendarios de solo lectura y eventos bloqueados/especiales no ofrecen estas acciones. Los eventos recurrentes se modifican/eliminan solo para la ocurrencia mostrada, no para toda la serie. Google notifica los cambios a los invitados. PATCH conserva campos ajenos al editor (descripción, asistentes, recurrencia, etc.); ETag impide sobrescribir una versión modificada fuera de MiPanel. Los cambios se reflejan sin pulsar Actualizar.

La escritura usa la misma Edge Function `google-calendar`, con sesión Supabase, comprobación del permiso OAuth y del rol del calendario, validación de campos y rutas codificadas. Nunca se envían tokens Google al navegador. El fin de un evento de día completo se muestra incluido en el editor y se convierte al fin exclusivo exigido por Google.

## Configuración

Además de activar el proveedor Google en Supabase y crear el cliente OAuth web
en Google Cloud, define en **Edge Function Secrets** estos valores privados:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Sus valores son el Client ID y Client Secret del mismo cliente OAuth que se
configura en el proveedor Google de Supabase. No deben añadirse a GitHub,
`.env.local` ni variables `VITE_*`.

La función reutiliza `MICROSOFT_TOKEN_ENCRYPTION_KEY` como clave AES-GCM para
cifrar la credencial de renovación de Google. No cambies esa clave después de
conectar una cuenta sin volver a conectarla: una clave nueva no puede descifrar
las credenciales creadas con la anterior.

Después de aplicar la migración
`202610060001_google_credentials.sql`, despliega:

```text
google-credentials
google-calendar
```

## Validación

1. En MiPanel, pulsa **Conectar Google** en el calendario.
2. Acepta los permisos de solo lectura.
3. Comprueba que la cuenta Microsoft continúa conectada.
4. Activa o desactiva calendarios individuales y cambia de mes.
5. Cierra y abre el navegador para verificar que los eventos vuelven a cargar.
6. Abre la cabecera de cualquier día y pulsa **Autorizar edición** si procede.
7. En un evento de prueba propio, edita título/horario y comprueba que se conserva el resto de sus datos.
8. Elimina ese evento con confirmación y verifica que desaparece de la agenda y del mes sin actualizar.
9. Comprueba que un calendario compartido de solo lectura no permite editar; en un evento recurrente, confirma que solo cambia la ocurrencia elegida.

La opción **Desconectar Google** borra la credencial cifrada del vault y
desvincula la identidad Google, sin afectar a Microsoft.
