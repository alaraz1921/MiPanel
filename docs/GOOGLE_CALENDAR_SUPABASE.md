# Google Calendar con Supabase

MiPanel conecta Google Calendar como una identidad adicional de la sesión
existente de Supabase. Así, conectar Google no desconecta Microsoft To Do.

## Permisos

La primera versión solicita únicamente:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.events.readonly`

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

La opción **Desconectar Google** borra la credencial cifrada del vault y
desvincula la identidad Google, sin afectar a Microsoft.
