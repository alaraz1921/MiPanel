# Arquitectura híbrida de MiPanel

## Objetivo

MiPanel mantendrá una única interfaz React y podrá ejecutarse como SPA web y,
cuando se habilite de nuevo ese empaquetado, como extensión Chromium. Ambas
superficies compartirán un backend opcional en Supabase para resolver la
autenticación de Microsoft y las llamadas a Graph sin exponer secretos ni
depender de que el navegador conserve una caché MSAL entre reinicios.

## Primera etapa

La primera etapa activa Supabase Auth cuando existe configuración pública y
mantiene MSAL como fallback local. La autenticación Azure y la restauración de
sesión entre reinicios ya están validadas en GitHub Pages. Durante esta
transición el adaptador usa temporalmente el token de proveedor entregado por
la sesión para mantener operativas las tareas existentes.

El backend previsto será:

1. Supabase Auth para identificar al usuario de MiPanel.
2. Una Edge Function para intercambiar y renovar la autorización de Microsoft.
3. Una Edge Function para ejecutar las operaciones permitidas de Microsoft Graph.
4. RLS para cualquier configuración propia que se almacene en Supabase.

Los client secrets permanecerán en Supabase y nunca llegarán al bundle. La
sesión de Supabase es gestionada por su SDK para permitir la continuidad entre
reinicios; MiPanel no escribe ni manipula manualmente refresh tokens. En la
siguiente etapa las llamadas Graph dejarán de usar el token de proveedor en el
frontend y pasarán por una Edge Function.

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

La URL, la clave pública y los nombres finales de las funciones se fijarán al
crear el proyecto Supabase; no se inventan identificadores en el repositorio.
