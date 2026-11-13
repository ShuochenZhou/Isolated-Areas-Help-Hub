import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { miniappPlugin } from './src/compiler/plugin'

export default defineConfig({
  plugins: [vue({ template: { compilerOptions: { isCustomElement: tag => tag.startsWith('wx-') } } }), miniappPlugin({ root: '../resident-miniapp' })],
  server: { fs: { allow: [resolve(__dirname, '..')] } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom'
  }
})
