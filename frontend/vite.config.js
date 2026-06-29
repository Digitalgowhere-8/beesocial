import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      // axios baseURL is now <backendUrl>/api, so all API calls are /api/*.
      // In local dev, proxy /api → backend:5000 so no CORS issues.
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — cached separately, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI icons — large library, cache separately
          'vendor-icons': ['lucide-react'],
          // Utility libraries
          'vendor-utils': ['axios', 'date-fns']
        }
      }
    }
  }
});
