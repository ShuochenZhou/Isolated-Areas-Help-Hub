// wx storage on top of localStorage. Values keep their type (WeChat stores objects, numbers and
// booleans as they are); a browser that refuses storage falls back to memory for the session.
import { EMBEDDED, STORAGE_PREFIX } from './env'

const memory = new Map<string, string>()

function backend(): Storage | null {
  try {
    const store = window.localStorage
    const probe = `${STORAGE_PREFIX}__probe`
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch { return null }
}
const store = typeof window === 'undefined' ? null : backend()

function read(key: string): string | null {
  return store ? store.getItem(STORAGE_PREFIX + key) : (memory.get(key) ?? null)
}

export function setItem(key: string, value: unknown): void {
  const text = JSON.stringify({ v: value === undefined ? null : value })
  if (store) store.setItem(STORAGE_PREFIX + key, text)
  else memory.set(key, text)
}

// The phone preview on the English entry page opens straight into the English interface instead of the
// bilingual language picker. Only defaults: a language the visitor chose themselves still wins, and the
// full-window web simulation keeps the picker.
const EMBED_DEFAULTS: Record<string, unknown> = { language: 'en', languageRemembered: true }

/** WeChat returns "" for a key that was never set. */
export function getItem(key: string): unknown {
  const text = read(key)
  if (text === null) return EMBEDDED && key in EMBED_DEFAULTS ? EMBED_DEFAULTS[key] : ''
  try { return (JSON.parse(text) as { v: unknown }).v } catch { return '' }
}

export function removeItem(key: string): void {
  if (store) store.removeItem(STORAGE_PREFIX + key)
  else memory.delete(key)
}

export function keys(): string[] {
  if (!store) return [...memory.keys()]
  const out: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key && key.startsWith(STORAGE_PREFIX) && !key.startsWith(`${STORAGE_PREFIX}__`)) out.push(key.slice(STORAGE_PREFIX.length))
  }
  return out
}

export function clear(): void {
  keys().forEach(removeItem)
}

/** Raw (untyped) entries the runtime keeps for itself, outside the WeChat application's storage. */
export function getRuntimeValue(name: string): string | null {
  try { return store ? store.getItem(`${STORAGE_PREFIX}__${name}`) : memory.get(`__${name}`) ?? null } catch { return null }
}

export function setRuntimeValue(name: string, value: string): void {
  try {
    if (store) store.setItem(`${STORAGE_PREFIX}__${name}`, value)
    else memory.set(`__${name}`, value)
  } catch { /* Kept for this session only. */ }
}
