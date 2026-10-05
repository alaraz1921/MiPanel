# Vault de Microsoft en Supabase

Esta fase permite que MiPanel conserve la autorización de Microsoft sin exponer
credenciales de renovación al navegador. El flujo actual directo con Graph sigue
activo hasta que este vault esté configurado y se haya validado con una cuenta
real.

## Qué guarda

La migración `202610050001_microsoft_credentials.sql` crea una tabla sin
políticas RLS para clientes. Solo las Edge Functions, usando la service role,
pueden acceder a ella. El valor almacenado es un refresh token cifrado con
AES-GCM; no se guarda ningún token en texto plano en la base de datos ni en la
aplicación web.

`microsoft-credentials` recibe un refresh token solamente al terminar un login
de Azure, lo cifra y lo asocia al usuario autenticado de Supabase. Al
desconectar, MiPanel solicita su borrado antes de cerrar sesión.

`microsoft-graph` obtiene y descifra esa credencial en el servidor, solicita un
access token temporal a Microsoft y llama a Graph. Si Microsoft rota el refresh
token, la función reemplaza el valor cifrado.

## Configuración necesaria en Supabase

1. Aplicar la migración SQL desde el panel de Supabase o con `supabase db push`.
2. Desplegar las funciones `microsoft-credentials` y `microsoft-graph`.
3. En **Edge Function Secrets**, definir estos valores sin incorporarlos a Git
   ni a variables `VITE_*`:

   - `MICROSOFT_CLIENT_ID`: identificador público de la aplicación Entra.
   - `MICROSOFT_CLIENT_SECRET`: secreto actual de la aplicación Entra.
   - `MICROSOFT_TENANT`: `common` si se admiten ambos tipos de cuenta, o el ID
     del tenant si se restringe a uno.
   - `MICROSOFT_TOKEN_ENCRYPTION_KEY`: clave aleatoria de 32 bytes codificada en
     Base64. Consérvala en un gestor de contraseñas: perderla impide descifrar
     las conexiones existentes y obliga a reconectarlas.

4. Después del despliegue, desconectar y volver a conectar Microsoft una vez.
   Esto permite a MiPanel guardar la credencial de renovación cifrada.

## Activación controlada

El frontend continúa intencionadamente con la llamada directa a Graph. No debe
activarse el backend hasta validar los pasos anteriores y una carga real de
listas y tareas. La Edge Function deja de aceptar el header
`x-microsoft-access-token`: solo admite una sesión de Supabase y nunca devuelve
tokens de Microsoft al navegador.

Al activar el backend, comprobar como mínimo: conexión nueva, recarga de la
página, reinicio completo del navegador, actualización de tareas, edición y
desconexión. Si algo falla, volver temporalmente al camino directo evita perder
la funcionalidad existente.
