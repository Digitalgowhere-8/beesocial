import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
	host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'https://beesocial-backend.wonderfulmoss-11cf811e.centralindia.azurecontainerapps.io',
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
