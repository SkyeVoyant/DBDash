import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: parseInt(process.env.FRONTEND_PORT || '8888'),
    strictPort: true
  }
});

