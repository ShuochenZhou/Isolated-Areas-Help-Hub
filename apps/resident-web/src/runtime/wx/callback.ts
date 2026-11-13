// WeChat's async API style: success/fail/complete callbacks, or a Promise when none is given.

export interface CallbackOptions {
  success?: (result: unknown) => void
  fail?: (error: unknown) => void
  complete?: (result: unknown) => void
  [key: string]: unknown
}

export interface WxError { errMsg: string; [key: string]: unknown }

export function toWxError(api: string, error: unknown): WxError {
  if (error && typeof error === 'object' && typeof (error as WxError).errMsg === 'string') return error as WxError
  const message = error instanceof Error ? error.message : String(error ?? '')
  return { errMsg: `${api}:fail ${message}`.trim() }
}

/** Wraps an implementation so callers get WeChat's callback-or-promise behaviour. */
export function wxApi<O extends CallbackOptions, R extends object>(name: string, implementation: (options: O) => Promise<R> | R) {
  return (options: O = {} as O): Promise<R & { errMsg: string }> | undefined => {
    const run = Promise.resolve()
      .then(() => implementation(options))
      .then(result => ({ errMsg: `${name}:ok`, ...result }) as R & { errMsg: string })
      .catch(error => { throw toWxError(name, error) })
    const usesCallbacks = typeof options.success === 'function' || typeof options.fail === 'function' || typeof options.complete === 'function'
    if (!usesCallbacks) return run
    run.then(
      result => { options.success?.(result); options.complete?.(result) },
      error => { options.fail?.(error); options.complete?.(error) }
    )
    return undefined
  }
}
