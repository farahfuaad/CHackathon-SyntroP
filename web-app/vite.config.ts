import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = env.VITE_BASE_PATH || '/';

  return {
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/rest': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
        },
        '/api/agent': {
          target: 'http://localhost:7071',
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
