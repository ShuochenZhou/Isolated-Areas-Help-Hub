// wx.cloud.callContainer and wx.request over fetch.
//
// In WeChat, callContainer reaches the CloudRun service through WeChat's gateway, which also
// vouches for the user (X-WX-OPENID). A browser has no WeChat identity, so this is where the
// web version differs: requests go to the backend over HTTPS, and the WeChat application's CloudRun
// sign-in (/api/auth/cloudrun) is answered by the web sign-in (/api/auth/web) with a device key
// this browser keeps. Every other request is passed through as it is.
import { API_ORIGIN } from '../env'
import { getRuntimeValue, setRuntimeValue } from '../storage'

const DEVICE_KEY = 'web-device-key'

/** A random 256-bit key that identifies this browser's resident account. */
export function deviceKey(): string {
  const existing = getRuntimeValue(DEVICE_KEY)
  if (existing && /^[A-Za-z0-9_-]{43,128}$/.test(existing)) return existing
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  setRuntimeValue(DEVICE_KEY, key)
  return key
}

// Headers only WeChat's gateway understands.
const GATEWAY_HEADERS = /^x-wx-/i

export interface HttpOptions {
  url: string
  method?: string
  data?: unknown
  header?: Record<string, string>
  timeout?: number
  dataType?: string
  responseType?: string
}

export interface HttpResult { statusCode: number; data: unknown; header: Record<string, string>; cookies: string[] }

function withQuery(url: string, data: unknown): string {
  if (!data || typeof data !== 'object') return url
  const query = Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value))}`)
    .join('&')
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url
}

export async function http(api: string, options: HttpOptions): Promise<HttpResult> {
  const method = (options.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(options.header || {})) {
    if (!GATEWAY_HEADERS.test(key) && value !== undefined && value !== null) headers[key] = String(value)
  }
  let url = options.url
  let body: string | undefined
  if (method === 'GET' || method === 'HEAD') {
    url = withQuery(url, options.data)
  } else if (options.data !== undefined) {
    if (typeof options.data === 'string') body = options.data
    else {
      body = JSON.stringify(options.data)
      if (!Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json'
    }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || 60000)
  let response: Response
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal, credentials: 'omit' })
  } catch (error) {
    throw { errMsg: controller.signal.aborted ? `${api}:fail timeout` : `${api}:fail ${(error as Error)?.message || 'network error'}` }
  } finally {
    clearTimeout(timeout)
  }
  const text = await response.text()
  let data: unknown = text
  if ((options.dataType || 'json') === 'json' && text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  const header: Record<string, string> = {}
  response.headers.forEach((value, key) => { header[key] = value })
  return { statusCode: response.status, data, header, cookies: [] }
}

export interface CallContainerOptions {
  path: string
  method?: string
  data?: unknown
  header?: Record<string, string>
  timeout?: number
  dataType?: string
  config?: { env?: string }
}

export function callContainer(options: CallContainerOptions): Promise<HttpResult & { callID: string }> {
  let path = String(options.path || '')
  let data = options.data
  // The CloudRun sign-in, answered for a browser: same response shape, web identity instead of WeChat's.
  if (/^\/api\/auth\/cloudrun(?:[?#]|$)/.test(path)) {
    path = '/api/auth/web'
    data = { ...(data && typeof data === 'object' ? data : {}), deviceKey: deviceKey() }
  }
  return http('cloud.callContainer', { ...options, url: `${API_ORIGIN}${path}`, data })
    .then(result => ({ ...result, callID: `web-${Date.now().toString(36)}` }))
}
