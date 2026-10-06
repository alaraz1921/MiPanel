# Arquitectura híbrida de MiPanel

## Objetivo

MiPanel mantendrá una única interfaz React y podrá ejecutarse como SPA web y,
cuando se habilite de nuevo ese empaquetado, como extensión Chromium. Ambas
superficies compartirán un backend opcional en Supabase para resolver la
autenticación de Microsoft y las llamadas a Graph sin exponer secretos ni
depender de que el navegador conserve una caché MSAL entre reinicios.

## Primera etapa

Supabase Auth se activa cuando existe configuración pública; MSAL queda como
alternativa cuando no se configura Supabase. El navegador usa la sesión de
MiPanel para autorizar las Edge Functions y no necesita un `provider_token`
Azure al restaurar la sesión. Supabase renueva su propia sesión, no los tokens
del proveedor Microsoft.

El backend previsto será:

1. Supabase Auth para identificar al usuario de MiPanel.
2. Una Edge Function para intercambiar y renovar la autorización de Microsoft.
3. Una Edge Function para ejecutar las operaciones permitidas de Microsoft Graph.
4. RLS para cualquier configuración propia que se almacene en Supabase.

Los client secrets permanecerán en Supabase y nunca llegarán al bundle. La
sesión de Supabase es gestionada por su SDK para permitir la continuidad entre
reinicios. El callback de una conexión Microsoft iniciada explícitamente envía
la credencial de renovación a `microsoft-credentials`, que la valida con
Microsoft y la cifra. Una sesión antigua o una conexión Google no deben
sobrescribir el vault Microsoft. Los tokens de Graph se renuevan en el servidor.

## Configuración prevista

El frontend podrá recibir únicamente:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MICROSOFT_CLIENT_ID=
VITE_MICROSOFT_TENANT=common
```

El client secret de Entra y las credenciales de Graph se configurarán como
secretos de Supabase, nunca en `.env.local` del frontend ni en Git.

## Orden de implementación

1. Crear el proyecto Supabase y confirmar su URL y clave pública.
2. Configurar Entra con una plataforma web para el callback del backend.
3. Crear y probar la función de autenticación sin modificar todavía la UI.
4. Crear el adaptador de Graph y probar lectura de listas y tareas.
5. Cambiar el contexto de Microsoft para preferir backend y conservar MSAL como
   fallback temporal.
6. Probar persistencia de sesión al cerrar y abrir el navegador.
7. Reutilizar el mismo frontend en la extensión Chromium.

La función `microsoft-graph` verifica la sesión Supabase, limita las rutas a
Microsoft To Do y renueva la autorización desde el vault cifrado. Comparte la
renovación entre peticiones concurrentes de una instancia y actualiza el vault
solo si la credencial leída sigue siendo la actual. Distingue autorización
revocada (`MicrosoftReconnectRequired`, 401), configuración rechazada
(`MicrosoftConfiguration`, 503) y fallos temporales (`MicrosoftUnavailable`, 503).
Solo reintenta fallos temporales; los códigos AADSTS permiten diagnosticar el
rechazo sin exponer tokens ni el cuerpo completo de la respuesta OAuth.

Regresiones reproducibles, sin credenciales reales:
`node scripts/verify-microsoft-auth.cjs`. La prueba usa respuestas simuladas;
la continuidad real durante horas y entre reinicios se valida en el navegador.

La URL y la clave pública se configuran mediante variables de entorno; no se
inventan secretos ni identificadores privados en el repositorio.
