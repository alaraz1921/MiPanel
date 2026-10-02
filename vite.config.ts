import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  return {
    // El build local se sirve desde la raíz. El modo dedicado evita que la
    // ruta de GitHub Pages dependa de variables disponibles durante el build.
    base: mode === 'github-pages' ? '/MiPanel/' : '/',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: 'index.html',
          microsoftAuthRedirect: 'microsoft-auth-redirect.html',
        },
      },
    },
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: 'localhost',
      port: 4173,
    },
  };
});
