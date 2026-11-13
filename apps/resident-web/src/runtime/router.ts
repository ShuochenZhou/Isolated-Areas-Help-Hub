// The page stack, as WeChat keeps it: navigateTo pushes, navigateBack pops, switchTab closes every
// non-tab page and keeps tab pages alive, reLaunch starts over. Lifecycle hooks fire in WeChat's
// order. The browser's history follows the stack, so the back button/gesture works as expected.
import { reactive, shallowReactive } from 'vue'
import { appConfig } from 'virtual:miniapp'
import { callApp, invoke } from './app'
import { callPage, createPage, type PageRecord } from './page'

export const firstPage = appConfig.pages[0]
const knownPages = new Set(appConfig.pages)
const tabList = appConfig.tabBar?.list || []
const tabRoutes = new Set(tabList.map(item => item.pagePath))
export const isTabRoute = (route: string) => tabRoutes.has(route)

export const state = shallowReactive({
  /** The page stack, bottom first. */
  stack: [] as PageRecord[],
  /** Every page that is mounted: the stack plus tab pages kept alive in the background. */
  alive: [] as PageRecord[]
})

export const tabBar = reactive({
  hidden: false,
  color: appConfig.tabBar?.color || '#7A7E83',
  selectedColor: appConfig.tabBar?.selectedColor || '#3cc51f',
  backgroundColor: appConfig.tabBar?.backgroundColor || '#ffffff',
  borderStyle: appConfig.tabBar?.borderStyle || 'black',
  items: tabList.map(item => ({ ...item, badge: '', redDot: false }))
})

const tabRecords = new Map<string, PageRecord>()
let appHidden = false

export function current(): PageRecord | undefined {
  return state.stack[state.stack.length - 1]
}

export function currentPages(): PageRecord['instance'][] {
  return state.stack.map(record => record.instance)
}

// ---- lifecycle -------------------------------------------------------------------------------

function showPage(record: PageRecord) {
  if (record.shown || record.unloaded || appHidden) return
  record.shown = true
  callPage(record, 'onShow')
}

function hidePage(record: PageRecord) {
  if (!record.shown) return
  record.shown = false
  callPage(record, 'onHide')
}

function loadPage(record: PageRecord) {
  record.loaded = true
  callPage(record, 'onLoad', { ...record.query })
}

function unloadPage(record: PageRecord) {
  if (record.unloaded) return
  record.unloaded = true
  record.shown = false
  callPage(record, 'onUnload')
  if (tabRecords.get(record.route) === record) tabRecords.delete(record.route)
}

/** The page is on screen and rendered once. */
export function markReady(record: PageRecord) {
  if (record.ready || record.unloaded) return
  record.ready = true
  callPage(record, 'onReady')
}

/** wx.onAppShow / wx.onAppHide listeners, called after App's own hooks. */
export const appListeners = { show: new Set<(options: unknown) => void>(), hide: new Set<() => void>() }

let launchQuery: Record<string, string> = {}
const launchOptions = () => ({ path: current()?.route || firstPage, query: { ...launchQuery }, scene: 1001, referrerInfo: {} })

/** The WeChat application goes to the background (WeChat: the user leaves it). */
export function hideApp() {
  if (appHidden) return
  const page = current()
  if (page) hidePage(page)
  appHidden = true
  callApp('onHide')
  appListeners.hide.forEach(listener => invoke(listener, undefined))
}

/** The WeChat application comes back to the foreground. */
export function showApp() {
  if (!appHidden) return
  appHidden = false
  const options = launchOptions()
  callApp('onShow', options)
  appListeners.show.forEach(listener => invoke(listener, undefined, [options]))
  const page = current()
  if (page) showPage(page)
}

// ---- urls ------------------------------------------------------------------------------------

function decode(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

export function parseUrl(url: string, from?: string): { route: string; query: Record<string, string> } {
  const [pathPart, ...rest] = String(url || '').split('?')
  const queryPart = rest.join('?')
  let parts: string[]
  if (pathPart.startsWith('/')) parts = pathPart.split('/')
  else parts = (from ? from.split('/').slice(0, -1) : []).concat(pathPart.split('/'))
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  const query: Record<string, string> = {}
  for (const pair of queryPart.split('&')) {
    if (!pair) continue
    const index = pair.indexOf('=')
    const key = decode(index < 0 ? pair : pair.slice(0, index))
    query[key] = decode(index < 0 ? '' : pair.slice(index + 1))
  }
  return { route: out.join('/').replace(/\.html$/, ''), query }
}

function pageUrl(record: PageRecord) {
  const query = Object.entries(record.query).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  return `#/${record.route}${query ? `?${query}` : ''}`
}

// ---- browser history -------------------------------------------------------------------------

let historyDepth = 0
let ignoredPops = 0
let pendingReplace: string | null = null

function syncHistory(kind: 'push' | 'replace' | 'back', count = 1) {
  const page = current()
  if (!page || typeof history === 'undefined') return
  const url = pageUrl(page)
  try {
    if (kind === 'push') {
      history.pushState({ wxDepth: state.stack.length }, '', url)
      historyDepth++
      return
    }
    const pops = kind === 'back' ? Math.min(count, historyDepth) : historyDepth
    if (pops > 0) {
      historyDepth -= pops
      ignoredPops++
      pendingReplace = url
      history.go(-pops)
    } else {
      history.replaceState({ wxDepth: state.stack.length }, '', url)
    }
  } catch { /* History is a convenience; navigation already happened. */ }
}

function onPopState() {
  if (ignoredPops > 0) {
    ignoredPops--
    if (pendingReplace) {
      try { history.replaceState({ wxDepth: state.stack.length }, '', pendingReplace) } catch { /* ignore */ }
      pendingReplace = null
    }
    return
  }
  // The browser's back button or gesture.
  if (state.stack.length > 1) {
    historyDepth = Math.max(0, historyDepth - 1)
    void navigateBack({ delta: 1 }, true).catch(() => undefined)
  }
}

// ---- navigation ------------------------------------------------------------------------------

type Result = { errMsg: string }
let chain: Promise<unknown> = Promise.resolve()

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  chain = run.catch(() => undefined)
  return run
}

const failure = (api: string, message: string): Result => ({ errMsg: `${api}:fail ${message}` })

// One frame for the new page to mount before it animates in (a hidden tab gets no frames, hence the timer).
async function settle() {
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 50)
    requestAnimationFrame(() => { clearTimeout(timer); resolve(undefined) })
  })
}

export function navigateTo(options: { url: string }): Promise<Result> {
  return serial(async () => {
    const from = current()
    const target = parseUrl(options.url, from?.route)
    if (!knownPages.has(target.route)) throw failure('navigateTo', `page "${target.route}" is not found`)
    if (isTabRoute(target.route)) throw failure('navigateTo', 'can not navigateTo a tabbar page')
    if (state.stack.length >= 10) throw failure('navigateTo', 'webview count limit exceed')
    const record = createPage(target.route, target.query)
    if (from) hidePage(from)
    state.stack = [...state.stack, record]
    state.alive = [...state.alive, record]
    loadPage(record)
    showPage(record)
    syncHistory('push')
    await settle()
    await Promise.all([record.animate?.('enter'), from?.animate?.('cover')])
    return { errMsg: 'navigateTo:ok' }
  })
}

export function navigateBack(options: { delta?: number } = {}, fromHistory = false): Promise<Result> {
  return serial(async () => {
    const stack = state.stack
    if (stack.length <= 1) throw failure('navigateBack', 'cannot navigate back at first page.')
    const count = Math.min(Math.max(1, Math.floor(Number(options.delta) || 1)), stack.length - 1)
    const leaving = stack.slice(stack.length - count)
    const target = stack[stack.length - 1 - count]
    const top = leaving[leaving.length - 1]
    for (const record of leaving.slice().reverse()) unloadPage(record)
    top.leaving = true
    state.stack = stack.slice(0, stack.length - count)
    showPage(target)
    if (!fromHistory) syncHistory('back', count)
    await Promise.all([top.animate?.('leave'), target.animate?.('uncover')])
    state.alive = state.alive.filter(record => !leaving.includes(record))
    return { errMsg: 'navigateBack:ok' }
  })
}

export function redirectTo(options: { url: string }): Promise<Result> {
  return serial(async () => {
    const from = current()
    const target = parseUrl(options.url, from?.route)
    if (!knownPages.has(target.route)) throw failure('redirectTo', `page "${target.route}" is not found`)
    if (isTabRoute(target.route)) throw failure('redirectTo', 'can not redirectTo a tabbar page')
    const record = createPage(target.route, target.query)
    if (from) unloadPage(from)
    state.stack = [...state.stack.slice(0, -1), record]
    state.alive = [...state.alive.filter(item => item !== from), record]
    loadPage(record)
    showPage(record)
    syncHistory('replace')
    return { errMsg: 'redirectTo:ok' }
  })
}

export function switchTab(options: { url: string }): Promise<Result> {
  return serial(async () => {
    const target = parseUrl(options.url, current()?.route)
    if (!isTabRoute(target.route)) throw failure('switchTab', `can not switch to no-tabBar page "${target.route}"`)
    const existing = tabRecords.get(target.route)
    if (existing && state.stack.length === 1 && state.stack[0] === existing) return { errMsg: 'switchTab:ok' }
    const closing = state.stack.filter(record => !record.isTab)
    for (const record of closing.slice().reverse()) unloadPage(record)
    for (const record of state.stack) if (record.isTab && record !== existing) hidePage(record)
    let record = existing
    let created = false
    if (!record) {
      record = createPage(target.route, {})
      tabRecords.set(target.route, record)
      created = true
    }
    state.stack = [record]
    state.alive = [...state.alive.filter(item => !closing.includes(item) && item !== record), record]
    if (created) loadPage(record)
    showPage(record)
    syncHistory('replace')
    return { errMsg: 'switchTab:ok' }
  })
}

export function reLaunch(options: { url: string }): Promise<Result> {
  return serial(async () => {
    const target = parseUrl(options.url, current()?.route)
    if (!knownPages.has(target.route)) throw failure('reLaunch', `page "${target.route}" is not found`)
    for (const record of state.alive.slice().reverse()) unloadPage(record)
    tabRecords.clear()
    const record = createPage(target.route, target.query)
    if (record.isTab) tabRecords.set(target.route, record)
    state.stack = [record]
    state.alive = [record]
    loadPage(record)
    showPage(record)
    syncHistory('replace')
    return { errMsg: 'reLaunch:ok' }
  })
}

/** Starts the WeChat application: App() first, then the entry page (the url's #/route, or the first page). */
export function launch(): void {
  const fromHash = typeof location !== 'undefined' && location.hash.startsWith('#/') ? parseUrl(location.hash.slice(1)) : null
  const entry = fromHash && knownPages.has(fromHash.route) ? fromHash : { route: firstPage, query: {} }
  launchQuery = entry.query
  callApp('onLaunch', { path: entry.route, query: { ...entry.query }, scene: 1001, referrerInfo: {} })
  callApp('onShow', { path: entry.route, query: { ...entry.query }, scene: 1001, referrerInfo: {} })
  const record = createPage(entry.route, entry.query)
  if (record.isTab) tabRecords.set(entry.route, record)
  state.stack = [record]
  state.alive = [record]
  loadPage(record)
  showPage(record)
  syncHistory('replace')
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', onPopState)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hideApp()
      else showApp()
    })
  }
}
