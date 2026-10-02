import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');

  return {
    // El build local se sirve desde la raíz. GitHub Pages define /MiPanel/
    // mediante VITE_BASE_PATH en su workflow de despliegue.
    base: env.VITE_BASE_PATH || '/',
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
