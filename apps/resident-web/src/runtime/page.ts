// Page(): page definitions, page instances with WeChat's setData semantics, and the helpers
// ($wx) the compiled templates call for events, keys and text.
import { nextTick, ref, shallowRef, type Ref } from 'vue'
import { appConfig, pageConfigs } from 'virtual:miniapp'
import { convertUnits } from '../compiler/units'
import { invoke } from './app'
import { requireModule } from './modules'
import type { ComponentEvent, WindowConfig, WxEvent } from './types'

type PageDefinition = Record<string, unknown> & { data?: Record<string, unknown> }

const definitions = new Map<string, PageDefinition>()

export function definePage(route: string, options: PageDefinition): void {
  definitions.set(route, options)
}

function pageDefinition(route: string): PageDefinition {
  if (!definitions.has(route)) requireModule(`${route}.js`)
  const definition = definitions.get(route)
  if (!definition) throw new Error(`${route}.js did not call Page()`)
  return definition
}

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  try { return structuredClone(value) } catch { return JSON.parse(JSON.stringify(value)) as T }
}

export interface PageConfig extends Required<Pick<WindowConfig, 'navigationBarTitleText' | 'navigationBarBackgroundColor' | 'navigationBarTextStyle' | 'backgroundColor' | 'backgroundTextStyle'>> {
  enablePullDownRefresh: boolean
  onReachBottomDistance: number
  navigationStyle: 'default' | 'custom'
  disableScroll: boolean
}

export function pageConfig(route: string): PageConfig {
  const merged = { ...(appConfig.window || {}), ...(pageConfigs[route] || {}) }
  return {
    navigationBarTitleText: merged.navigationBarTitleText || '',
    navigationBarBackgroundColor: merged.navigationBarBackgroundColor || '#000000',
    navigationBarTextStyle: merged.navigationBarTextStyle === 'white' ? 'white' : 'black',
    backgroundColor: merged.backgroundColor || '#ffffff',
    backgroundTextStyle: merged.backgroundTextStyle === 'light' ? 'light' : 'dark',
    enablePullDownRefresh: Boolean(merged.enablePullDownRefresh),
    onReachBottomDistance: merged.onReachBottomDistance ?? 50,
    navigationStyle: merged.navigationStyle === 'custom' ? 'custom' : 'default',
    disableScroll: Boolean(merged.disableScroll)
  }
}

export interface MapApi {
  getCenterLocation(): { latitude: number; longitude: number }
  moveToLocation(latitude: number, longitude: number): void
  getScale(): number
  getRegion(): { southwest: { latitude: number; longitude: number }; northeast: { latitude: number; longitude: number } }
  includePoints(points: { latitude: number; longitude: number }[], padding?: number[]): void
}

export interface PageRecord {
  id: number
  route: string
  query: Record<string, string>
  instance: PageInstance
  config: PageConfig
  isTab: boolean
  title: Ref<string>
  navBackground: Ref<string>
  navText: Ref<'black' | 'white'>
  tick: Ref<number>
  refreshing: Ref<boolean>
  shown: boolean
  loaded: boolean
  ready: boolean
  unloaded: boolean
  /** Sliding out after navigateBack; drawn above the page it reveals. */
  leaving?: boolean
  scroller: Ref<HTMLElement | null>
  maps: Map<string, MapApi>
  helpers: TemplateHelpers
  animate?: (kind: PageAnimation) => Promise<void>
}

export type PageAnimation = 'enter' | 'cover' | 'leave' | 'uncover'

export interface PageInstance {
  data: Record<string, unknown>
  route: string
  options: Record<string, string>
  setData(update: Record<string, unknown>, callback?: () => void): void
  [key: string]: unknown
}

type PathKey = string | number

/** "a.b[2].c" -> ["a", "b", 2, "c"], as WeChat reads setData keys. */
export function parsePath(path: string): PathKey[] {
  const keys: PathKey[] = []
  let current = ''
  for (let i = 0; i < path.length; i++) {
    const char = path[i]
    if (char === '\\' && i + 1 < path.length) { current += path[++i]; continue }
    if (char === '.') { if (current) keys.push(current); current = ''; continue }
    if (char === '[') {
      if (current) keys.push(current)
      current = ''
      const end = path.indexOf(']', i)
      const inner = path.slice(i + 1, end < 0 ? path.length : end)
      keys.push(/^\d+$/.test(inner) ? Number(inner) : inner.replace(/^['"]|['"]$/g, ''))
      i = end < 0 ? path.length : end
      continue
    }
    current += char
  }
  if (current) keys.push(current)
  return keys
}

/** Sets a path, copying each container on the way so renderers see new references. */
export function setPath(data: Record<string, unknown>, path: string, value: unknown): void {
  const keys = parsePath(path)
  if (keys.length <= 1) { data[String(keys[0] ?? path)] = value; return }
  let parent: Record<PathKey, unknown> = data
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const existing = parent[key]
    const copy = existing !== null && typeof existing === 'object'
      ? (Array.isArray(existing) ? existing.slice() : { ...(existing as object) })
      : (typeof keys[i + 1] === 'number' ? [] : {})
    parent[key] = copy
    parent = copy as Record<PathKey, unknown>
  }
  parent[keys[keys.length - 1]] = value
}

const pageMethods = {
  setData(this: PageInstance, update: Record<string, unknown>, callback?: () => void) {
    const record = recordOf(this)
    if (update && typeof update === 'object') {
      for (const key of Object.keys(update)) setPath(this.data, key, update[key])
    }
    if (record && !record.unloaded) record.tick.value++
    if (typeof callback === 'function') nextTick(() => invoke(callback, this))
  },
  selectComponent() { return null },
  selectAllComponents() { return [] },
  getOpenerEventChannel() { return { emit() {}, on() {}, once() {}, off() {} } },
  getPageId(this: PageInstance) { return `pageId:${recordOf(this)?.id ?? 0}` }
}

const records = new WeakMap<object, PageRecord>()
export const recordOf = (instance: object): PageRecord | undefined => records.get(instance)

let nextPageId = 1

export interface TemplateHelpers {
  s(value: unknown): unknown
  k(item: unknown, key: string, index: unknown): unknown
  style(value: unknown): unknown
  e(event: Event | ComponentEvent, handler: unknown, flags: number, dataset: Record<string, unknown>, id: unknown, mark: Record<string, unknown> | null): unknown
  block(event: Event): void
}

const DOM_TO_WX: Record<string, string> = { click: 'tap', contextmenu: 'longpress' }

function touches(event: Event | undefined): unknown[] {
  const list = event && 'touches' in event ? (event as TouchEvent).touches : null
  if (!list) {
    const mouse = event as MouseEvent | undefined
    return mouse && typeof mouse.clientX === 'number' ? [{ identifier: 0, pageX: mouse.pageX, pageY: mouse.pageY, clientX: mouse.clientX, clientY: mouse.clientY }] : []
  }
  return Array.from(list).map(touch => ({ identifier: touch.identifier, pageX: touch.pageX, pageY: touch.pageY, clientX: touch.clientX, clientY: touch.clientY }))
}

function helpersFor(record: () => PageRecord): TemplateHelpers {
  return {
    s: value => (value === undefined || value === null ? '' : value),
    k: (item, key, index) => {
      if (key === '*this') return item !== null && typeof item === 'object' ? index : item
      const value = item !== null && typeof item === 'object' ? (item as Record<string, unknown>)[key] : undefined
      return value === undefined || value === null || typeof value === 'object' ? index : value
    },
    style: value => (typeof value === 'string' ? convertUnits(value) : value),
    block: event => { if (event.cancelable) event.preventDefault() },
    e(raw, handler, flags, dataset, id, mark) {
      const page = record()
      const native = raw instanceof Event ? raw : raw?.native
      if (flags & 1 && native) {
        native.stopPropagation()
        if ((native.type === 'touchmove' || native.type === 'wheel') && native.cancelable) native.preventDefault()
      }
      if (native && native.type === 'contextmenu' && native.cancelable) native.preventDefault()
      const element = native?.currentTarget instanceof HTMLElement ? native.currentTarget : null
      const target = { id: id === undefined || id === null ? '' : String(id), dataset: dataset || {}, offsetLeft: element?.offsetLeft ?? 0, offsetTop: element?.offsetTop ?? 0 }
      const isDom = raw instanceof Event
      const mouse = native as MouseEvent | undefined
      const detail = isDom
        ? (mouse && typeof mouse.clientX === 'number' ? { x: mouse.pageX, y: mouse.pageY } : {})
        : ((raw as ComponentEvent).detail || {})
      const event: WxEvent = {
        type: isDom ? (DOM_TO_WX[(raw as Event).type] || (raw as Event).type) : (raw as ComponentEvent).type,
        timeStamp: Math.round(native?.timeStamp ?? performance.now()),
        target,
        currentTarget: target,
        detail,
        mark: mark || {},
        touches: touches(native),
        changedTouches: touches(native),
        ...(isDom ? {} : (raw as ComponentEvent).extra || {})
      }
      const fn = typeof handler === 'function' ? handler : page.instance[String(handler)]
      if (typeof fn !== 'function') {
        if (handler) console.warn(`Component "${page.route}" does not have a method "${String(handler)}" to handle event "${event.type}".`)
        return undefined
      }
      const result = invoke(fn, page.instance, [event])
      if (!isDom) (raw as ComponentEvent).respond?.(result)
      return result
    }
  }
}

export function createPage(route: string, query: Record<string, string>): PageRecord {
  const definition = pageDefinition(route)
  const instance = Object.create(pageMethods) as PageInstance
  for (const key of Object.keys(definition)) {
    if (key === 'data') continue
    const value = definition[key]
    instance[key] = typeof value === 'function' ? value : clone(value)
  }
  instance.data = clone(definition.data || {})
  instance.route = route
  instance.__route__ = route
  instance.options = { ...query }
  const config = pageConfig(route)
  const tabRoutes = new Set((appConfig.tabBar?.list || []).map(item => item.pagePath))
  let record!: PageRecord
  record = {
    id: nextPageId++,
    route,
    query,
    instance,
    config,
    isTab: tabRoutes.has(route),
    title: ref(config.navigationBarTitleText),
    navBackground: ref(config.navigationBarBackgroundColor),
    navText: ref(config.navigationBarTextStyle),
    tick: ref(0),
    refreshing: ref(false),
    shown: false,
    loaded: false,
    ready: false,
    unloaded: false,
    scroller: shallowRef(null),
    maps: new Map(),
    helpers: helpersFor(() => record)
  }
  records.set(instance, record)
  return record
}

/**
 * Template context: identifiers resolve against the page's data, $wx against the helpers. Every
 * read also reads the page's update counter, so whatever renders page data (including slot
 * content rendered by a component, e.g. a <button>'s text) re-renders after setData.
 */
export function templateContext(record: PageRecord): Record<string, unknown> {
  return new Proxy(Object.create(null) as Record<string, unknown>, {
    get: (_, key) => {
      if (key === '$wx') return record.helpers
      void record.tick.value
      return record.instance.data[key as string]
    },
    has: () => true
  })
}

export function callPage(record: PageRecord, hook: string, ...args: unknown[]): unknown {
  return invoke(record.instance[hook], record.instance, args)
}
