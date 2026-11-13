// Deployment settings of the web runtime (not of the WeChat application, whose config.js is used as is).

/** Origin of the backend API; empty means same origin (nginx or the Vite dev server proxies /api). */
export const API_ORIGIN = String(import.meta.env.VITE_API_ORIGIN || '').replace(/\/+$/, '')

/** Prefix for everything the runtime keeps in localStorage. */
export const STORAGE_PREFIX = 'helphub:'

/** Running inside the desktop showcase's phone frame. */
export const EMBEDDED = (() => {
  try { return window.self !== window.top || new URLSearchParams(location.search).has('embed') } catch { return true }
})()
