declare module 'virtual:miniapp' {
  /** One WeChat application module: its original CommonJS code wrapped by src/compiler/plugin.ts. */
  export type ModuleFactory = (...args: unknown[]) => void
  export const release: string
  export const appConfig: import('./types').AppConfig
  export const pageConfigs: Record<string, import('./types').PageJson>
  export const modules: Record<string, ModuleFactory>
  export const renders: Record<string, (ctx: unknown, cache: unknown[]) => import('vue').VNode>
  export const assets: Record<string, string>
}

declare module 'virtual:miniapp-meta' {
  export const release: string
}

declare module 'virtual:miniapp-styles.css'
