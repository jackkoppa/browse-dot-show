import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import path from 'path'
import { json5Plugin } from 'vite-plugin-json5'

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [
      tailwindcss(),
      react(),
      svgr(),
      json5Plugin(),
    ],
    build: {
      outDir: 'dist-v3',
      assetsDir: 'assets',
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'index-v3.html'),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5175, // Different port to avoid conflicts
    }
  };
})