// App(): the instance getApp() returns, and the way errors in WeChat application code reach its onError.

type AppInstance = Record<string, unknown> & {
  onLaunch?: (options: unknown) => void
  onShow?: (options: unknown) => void
  onHide?: () => void
  onError?: (error: string) => void
  onUnhandledRejection?: (event: { reason: unknown; promise: Promise<unknown> }) => void
}

let app: AppInstance | undefined

export function defineApp(options: Record<string, unknown>): void {
  if (app) throw new Error('App() can only be called once')
  app = Object.assign({}, options) as AppInstance
}

export function getAppInstance(): AppInstance | undefined {
  return app
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.stack && !error.stack.startsWith(error.message) ? `${error.message}\n${error.stack}` : (error.stack || error.message)
  return String(error)
}

/** WeChat hands a synchronous error thrown by WeChat application code to App.onError. */
export function reportError(error: unknown): void {
  console.error(error)
  const handler = app?.onError
  if (typeof handler === 'function') {
    try { handler.call(app, errorText(error)) } catch (inner) { console.error(inner) }
  }
}

/** Calls WeChat application code; a throw is reported instead of breaking the runtime. */
export function invoke<T>(fn: unknown, thisArg: unknown, args: unknown[] = []): T | undefined {
  if (typeof fn !== 'function') return undefined
  try {
    return fn.apply(thisArg, args) as T
  } catch (error) {
    reportError(error)
    return undefined
  }
}

export function callApp(hook: 'onLaunch' | 'onShow' | 'onHide', options?: unknown): void {
  if (app) invoke(app[hook], app, options === undefined ? [] : [options])
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', event => {
    const handler = app?.onUnhandledRejection
    if (typeof handler === 'function') invoke(handler, app, [{ reason: event.reason, promise: event.promise }])
  })
}
