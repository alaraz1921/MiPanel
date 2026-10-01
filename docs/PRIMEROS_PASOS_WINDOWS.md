# Primeros pasos en Windows

## Preparar la extensión

Instala Node.js 20.19+ o 22.12+ y ejecuta:

```powershell
cd V:\Proyectos\Git\MiPanel
npm ci
npm run typecheck
npm run build
```

La carpeta `dist` resultante es la extensión desempaquetada. Repite `npm run build` después de cambiar el código y pulsa **Actualizar** en la ficha de la extensión.

## Google Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo desarrollador**.
3. Selecciona **Cargar descomprimida** y elige `V:\Proyectos\Git\MiPanel\dist`.
4. Abre una pestaña nueva y comprueba que aparece MiPanel.

## Brave

1. Abre `brave://extensions`.
2. Activa **Modo desarrollador**.
3. Selecciona **Cargar descomprimida** y elige la misma carpeta `dist`.
4. Abre una pestaña nueva y comprueba MiPanel.

## Microsoft Edge

1. Abre `edge://extensions`.
2. Activa **Modo de desarrollador**.
3. Selecciona **Cargar desempaquetado** y elige la misma carpeta `dist`.
4. Abre una pestaña nueva y comprueba MiPanel.

En cada navegador verifica buscador, accesos, reloj, tareas, calendario, persistencia tras abrir otra pestaña y ausencia de errores en la ficha de la extensión y DevTools. MiPanel no necesita localhost ni una URL pública. `npm run dev` es solo una ayuda opcional de maquetación.

Tras cualquier cambio de código, ejecuta siempre `npm run typecheck` y `npm run build`; después pulsa **Recargar** en la página de extensiones antes de abrir una pestaña nueva.

Para probar Microsoft To Do, sigue primero la configuración de Entra descrita en `README.md`. Cada navegador o distribución puede tener un ID diferente y, por tanto, un redirect distinto.

No introduzcas credenciales en el código ni en archivos versionados.
