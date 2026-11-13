import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()], dts: 'src/auto-imports.d.ts' }),
    Components({ resolvers: [ElementPlusResolver()], dts: 'src/components.d.ts' }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // API_PROXY points the dev server at another backend, e.g. production. The proxy is same-origin
    // for the browser, so the Origin header is dropped instead of loosening the backend's CORS policy.
    proxy: {
      '/api': {
        target: process.env.API_PROXY || 'http://localhost:8081',
        changeOrigin: true,
        // Runs on the incoming request before it is forwarded; returning nothing keeps proxying.
        bypass: (request) => {
          delete request.headers.origin
        },
      },
    },
  },
})
