import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/scraper-api': {
        target: process.env.VITE_SCRAPER_API_PROXY || 'http://127.0.0.1:8091',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scraper-api/, '')
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
