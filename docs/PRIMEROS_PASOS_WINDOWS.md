# Primeros pasos en Windows

## Preparar la web

Instala Node.js 20.19+ o 22.12+ y ejecuta:

```powershell
cd V:\Proyectos\Git\MiPanel
npm ci
npm run typecheck
npm run build
```

La carpeta `dist` resultante contiene la SPA estática. Repite `npm run build` después de cambiar el código antes de desplegarla.

## Desarrollo local

1. Ejecuta `npm run dev`.
2. Abre `http://localhost:5173` en Chrome, Brave, Edge, Firefox o Safari.
3. Comprueba buscador, accesos, reloj, tareas, calendario y persistencia tras recargar.

## Despliegue

Publica el contenido de `dist/` en un hosting estático HTTPS. MiPanel no requiere backend ni instalación de extensión.

## Microsoft To Do

1. Configura `VITE_MICROSOFT_CLIENT_ID` y `VITE_MICROSOFT_TENANT` en `.env.local`.
2. En Microsoft Entra registra `http://localhost:5173/` y `https://alaraz1921.github.io/MiPanel/` como redirects de plataforma **SPA**.

## Publicar en GitHub Pages

1. En GitHub abre **Settings → Pages** y selecciona **GitHub Actions** como origen.
2. Haz push a `main`. El workflow `Desplegar en GitHub Pages` publica `https://alaraz1921.github.io/MiPanel/`.
3. Configura después esa URL exacta en Microsoft Entra y vuelve a conectar la cuenta para renovar el consentimiento.
3. Pulsa **Conectar Microsoft** desde MiPanel y completa la identificación en la ventana emergente.

Tras cualquier cambio de código, ejecuta siempre `npm run typecheck` y `npm run build`. Abre el sitio en el navegador y revisa DevTools si aparece algún error.

No introduzcas credenciales, client secrets ni tokens en el código ni en archivos versionados.
