// CommonJS for the WeChat application's modules: require() with relative and root paths, a module
// cache, and cycles resolved the way Node and WeChat do (a module sees a partly filled exports).
import { modules } from 'virtual:miniapp'

export interface ModuleGlobals {
  Page: (route: string) => (options: Record<string, unknown>) => void
  App: (options: Record<string, unknown>) => void
  getApp: () => unknown
  wx: unknown
  getCurrentPages: () => unknown[]
  Component: (options: Record<string, unknown>) => void
  Behavior: (options: Record<string, unknown>) => unknown
  global: Record<string, unknown>
}

interface LoadedModule { id: string; exports: unknown; loaded: boolean }

const cache = new Map<string, LoadedModule>()
let globals: ModuleGlobals | null = null

export function installModuleGlobals(value: ModuleGlobals): void {
  globals = value
}

function normalize(parts: string[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

export function resolveModule(from: string, spec: string): string {
  const base = spec.startsWith('/') ? [] : from.split('/').slice(0, -1)
  const path = normalize(base.concat(spec.split('/')))
  const candidates = [path, `${path}.js`, `${path}/index.js`]
  const found = candidates.find(candidate => candidate in modules)
  if (!found) throw new Error(`module "${path}" is not defined (required from ${from || 'app'})`)
  return found
}

export function requireModule(id: string): unknown {
  if (!globals) throw new Error('WeChat application runtime is not installed')
  const cached = cache.get(id)
  if (cached) return cached.exports
  const factory = modules[id]
  if (!factory) throw new Error(`module "${id}" is not defined`)
  const module: LoadedModule = { id, exports: {}, loaded: false }
  cache.set(id, module)
  const require = (spec: string) => requireModule(resolveModule(id, spec))
  const route = id.replace(/\.js$/, '')
  try {
    factory.call(module.exports, module, module.exports, require, globals.Page(route), globals.App, globals.getApp,
      globals.wx, globals.getCurrentPages, globals.Component, globals.Behavior, globals.global)
  } catch (error) {
    cache.delete(id)
    throw error
  }
  module.loaded = true
  return module.exports
}
