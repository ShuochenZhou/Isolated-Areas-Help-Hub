import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { miniappPlugin } from './src/compiler/plugin'

// The runtime's own components render <wx-*> elements; the WeChat application's WXML is compiled by
// src/compiler (with its own component/element split), not by this Vue plugin.
const runtimeElements = (tag: string) => tag.startsWith('wx-')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Where the dev/preview server forwards /api (the backend).
  const api = env.HELPHUB_API || 'http://localhost:8082'
  // Same as deploy/nginx.conf.template: same-origin API, so no Origin for the backend's CORS to judge.
  const proxy = {
    '/api': {
      target: api,
      changeOrigin: true,
      configure: (server: { on: (event: 'proxyReq', listener: (request: { removeHeader: (name: string) => void }) => void) => void }) => {
        server.on('proxyReq', request => request.removeHeader('origin'))
      }
    }
  }
  return {
    plugins: [vue({ template: { compilerOptions: { isCustomElement: runtimeElements } } }), miniappPlugin({ root: '../resident-miniapp' })],
    build: {
      target: 'es2020',
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html'), app: resolve(__dirname, 'app.html') },
        output: {
          manualChunks: id => (id.includes('node_modules/leaflet') ? 'leaflet' : id.includes('node_modules/@vue') || id.includes('node_modules/vue') ? 'vue' : undefined)
        }
      }
    },
    server: { port: 5175, proxy, fs: { allow: [resolve(__dirname, '..')] } },
    preview: { port: 4175, proxy }
  }
})
