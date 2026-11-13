// The wx object the WeChat application's code calls. Every API keeps WeChat's signature and result
// shape; what WeChat does natively (toasts, maps, the phone dialler...) is done by the browser.
import { nextTick } from 'vue'
import { release } from 'virtual:miniapp'
import { wgs84ToGcj02 } from '../geo'
import { callPage, recordOf, type MapApi, type PageRecord } from '../page'
import { appListeners, current, hideApp, navigateBack, navigateTo, reLaunch, redirectTo, showApp, state, switchTab, tabBar } from '../router'
import * as storage from '../storage'
import { systemText } from '../system-text'
import { hideToast, openActionSheet, openLocationViewer, openModal, showToast, ui, type ModalOptions, type ToastIcon } from '../ui'
import { wxApi, type CallbackOptions } from './callback'
import { callContainer, http, type CallContainerOptions, type HttpOptions } from './network'

type Options = CallbackOptions & Record<string, unknown>

const rootSize = () => {
  const root = document.getElementById('wx-app')
  return { width: root?.clientWidth || window.innerWidth, height: root?.clientHeight || window.innerHeight }
}

function pageRecord(page?: unknown): PageRecord | undefined {
  return (page && typeof page === 'object' ? recordOf(page) : undefined) || current()
}

function mapContext(id: string, page?: unknown) {
  const map = (): MapApi | undefined => pageRecord(page)?.maps.get(id)
  const call = <R extends object>(name: string, run: (api: MapApi, options: Options) => R) => wxApi<Options, R>(`MapContext.${name}`, options => {
    const api = map()
    if (!api) throw new Error(`map "${id}" is not found`)
    return run(api, options)
  })
  return {
    getCenterLocation: call('getCenterLocation', api => api.getCenterLocation()),
    moveToLocation: call('moveToLocation', (api, options) => {
      if (options.latitude === undefined || options.longitude === undefined) throw new Error('location is not available on the web')
      api.moveToLocation(Number(options.latitude), Number(options.longitude))
      return {}
    }),
    getScale: call('getScale', api => ({ scale: api.getScale() })),
    getRegion: call('getRegion', api => api.getRegion()),
    includePoints: call('includePoints', (api, options) => {
      api.includePoints((options.points || []) as { latitude: number; longitude: number }[], options.padding as number[] | undefined)
      return {}
    }),
    translateMarker: call('translateMarker', () => ({})),
    setCenterOffset: call('setCenterOffset', () => ({})),
    addMarkers: call('addMarkers', () => ({})),
    removeMarkers: call('removeMarkers', () => ({}))
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

function systemInfo() {
  const { width, height } = rootSize()
  const ua = navigator.userAgent
  const platform = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Mac/.test(ua) ? 'mac' : 'windows'
  return {
    brand: 'browser', model: 'web', pixelRatio: window.devicePixelRatio || 1,
    screenWidth: width, screenHeight: height, windowWidth: width, windowHeight: height,
    statusBarHeight: 0, language: navigator.language, version: '8.0.50', system: navigator.platform || 'web',
    platform, fontSizeSetting: 16, SDKVersion: '3.17.2', theme: 'light',
    safeArea: { left: 0, right: width, top: 0, bottom: height, width, height }
  }
}

export const wx = {
  // ---- storage ----
  setStorageSync: (key: string, data: unknown) => storage.setItem(String(key), data),
  getStorageSync: (key: string) => storage.getItem(String(key)),
  removeStorageSync: (key: string) => storage.removeItem(String(key)),
  clearStorageSync: () => storage.clear(),
  getStorageInfoSync: () => ({ keys: storage.keys(), currentSize: 0, limitSize: 10240 }),
  setStorage: wxApi<Options, object>('setStorage', options => { storage.setItem(String(options.key), options.data); return {} }),
  getStorage: wxApi<Options, object>('getStorage', options => {
    if (!storage.keys().includes(String(options.key))) throw new Error('data not found')
    return { data: storage.getItem(String(options.key)) }
  }),
  removeStorage: wxApi<Options, object>('removeStorage', options => { storage.removeItem(String(options.key)); return {} }),
  clearStorage: wxApi<Options, object>('clearStorage', () => { storage.clear(); return {} }),

  // ---- interaction ----
  showToast: wxApi<Options, object>('showToast', options => {
    showToast({ title: options.title as string, icon: options.icon as ToastIcon, image: options.image as string, duration: options.duration as number, mask: options.mask as boolean })
    return {}
  }),
  hideToast: wxApi<Options, object>('hideToast', () => { if (ui.toast?.icon !== 'loading') hideToast(); return {} }),
  showLoading: wxApi<Options, object>('showLoading', options => { showToast({ title: options.title as string, mask: options.mask as boolean }, true); return {} }),
  hideLoading: wxApi<Options, object>('hideLoading', () => { if (ui.toast?.icon === 'loading') hideToast(); return {} }),
  showModal: wxApi<Options, object>('showModal', options =>
    openModal(options as ModalOptions, { ok: systemText('ok'), cancel: systemText('cancel') })),
  showActionSheet: wxApi<Options, object>('showActionSheet', async options => {
    const tapIndex = await openActionSheet((options.itemList || []) as string[], { alertText: options.alertText as string, itemColor: options.itemColor as string })
    if (tapIndex < 0) throw { errMsg: 'showActionSheet:fail cancel' }
    return { tapIndex }
  }),

  // ---- navigation bar, tab bar, page ----
  setNavigationBarTitle: wxApi<Options, object>('setNavigationBarTitle', options => {
    const page = current()
    if (page) page.title.value = String(options.title ?? '')
    return {}
  }),
  setNavigationBarColor: wxApi<Options, object>('setNavigationBarColor', options => {
    const page = current()
    if (page) {
      if (options.backgroundColor) page.navBackground.value = String(options.backgroundColor)
      if (options.frontColor) page.navText.value = String(options.frontColor).toLowerCase() === '#ffffff' ? 'white' : 'black'
    }
    return {}
  }),
  showNavigationBarLoading: wxApi<Options, object>('showNavigationBarLoading', () => ({})),
  hideNavigationBarLoading: wxApi<Options, object>('hideNavigationBarLoading', () => ({})),
  hideHomeButton: wxApi<Options, object>('hideHomeButton', () => ({})),
  setTabBarItem: wxApi<Options, object>('setTabBarItem', options => {
    const item = tabBar.items[Number(options.index)]
    if (!item) throw new Error('tabbar item not found')
    if (options.text !== undefined) item.text = String(options.text)
    if (options.iconPath !== undefined) item.iconPath = String(options.iconPath)
    if (options.selectedIconPath !== undefined) item.selectedIconPath = String(options.selectedIconPath)
    return {}
  }),
  setTabBarStyle: wxApi<Options, object>('setTabBarStyle', options => {
    for (const key of ['color', 'selectedColor', 'backgroundColor', 'borderStyle'] as const) {
      if (options[key]) (tabBar as Record<string, unknown>)[key] = options[key]
    }
    return {}
  }),
  showTabBar: wxApi<Options, object>('showTabBar', () => { tabBar.hidden = false; return {} }),
  hideTabBar: wxApi<Options, object>('hideTabBar', () => { tabBar.hidden = true; return {} }),
  setTabBarBadge: wxApi<Options, object>('setTabBarBadge', options => { const item = tabBar.items[Number(options.index)]; if (item) item.badge = String(options.text ?? ''); return {} }),
  removeTabBarBadge: wxApi<Options, object>('removeTabBarBadge', options => { const item = tabBar.items[Number(options.index)]; if (item) item.badge = ''; return {} }),
  showTabBarRedDot: wxApi<Options, object>('showTabBarRedDot', options => { const item = tabBar.items[Number(options.index)]; if (item) item.redDot = true; return {} }),
  hideTabBarRedDot: wxApi<Options, object>('hideTabBarRedDot', options => { const item = tabBar.items[Number(options.index)]; if (item) item.redDot = false; return {} }),
  pageScrollTo: wxApi<Options, object>('pageScrollTo', options => {
    const scroller = current()?.scroller.value
    if (!scroller) return {}
    let top = Number(options.scrollTop) || 0
    if (typeof options.selector === 'string') {
      const target = scroller.querySelector(options.selector) as HTMLElement | null
      if (target) top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + (Number(options.offsetTop) || 0)
    }
    scroller.scrollTo({ top, behavior: options.duration === 0 ? 'auto' : 'smooth' })
    return {}
  }),
  startPullDownRefresh: wxApi<Options, object>('startPullDownRefresh', () => {
    const page = current()
    if (page && !page.refreshing.value) {
      page.refreshing.value = true
      callPage(page, 'onPullDownRefresh')
    }
    return {}
  }),
  stopPullDownRefresh: wxApi<Options, object>('stopPullDownRefresh', () => {
    for (const page of state.alive) page.refreshing.value = false
    return {}
  }),
  setBackgroundColor: wxApi<Options, object>('setBackgroundColor', () => ({})),
  setBackgroundTextStyle: wxApi<Options, object>('setBackgroundTextStyle', () => ({})),
  nextTick: (callback: () => void) => { void nextTick(callback) },

  // ---- routing ----
  navigateTo: wxApi<Options, object>('navigateTo', options => navigateTo({ url: String(options.url) })),
  redirectTo: wxApi<Options, object>('redirectTo', options => redirectTo({ url: String(options.url) })),
  navigateBack: wxApi<Options, object>('navigateBack', options => navigateBack({ delta: options.delta as number })),
  switchTab: wxApi<Options, object>('switchTab', options => switchTab({ url: String(options.url) })),
  reLaunch: wxApi<Options, object>('reLaunch', options => reLaunch({ url: String(options.url) })),

  // ---- network ----
  request: wxApi<Options, object>('request', options => http('request', options as unknown as HttpOptions)),
  cloud: {
    init: (options?: unknown) => { void options },
    callContainer: wxApi<Options, object>('cloud.callContainer', options => callContainer(options as unknown as CallContainerOptions)),
    callFunction: wxApi<Options, object>('cloud.callFunction', () => { throw new Error('cloud functions are not available on the web') })
  },

  // ---- location and maps ----
  createMapContext: (id: string, page?: unknown) => mapContext(String(id), page),
  openLocation: wxApi<Options, object>('openLocation', options => {
    const latitude = Number(options.latitude)
    const longitude = Number(options.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('invalid location')
    // WeChat leaves the WeChat application for its own map page and comes back when it is closed.
    hideApp()
    void openLocationViewer({
      latitude, longitude, name: String(options.name || ''), address: String(options.address || ''), scale: Number(options.scale) || 16
    }).then(showApp)
    return {}
  }),
  getLocation: wxApi<Options, object>('getLocation', options => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('location is not available'))
    navigator.geolocation.getCurrentPosition(position => {
      let { latitude, longitude } = position.coords
      if (options.type === 'gcj02') [latitude, longitude] = wgs84ToGcj02(latitude, longitude)
      resolve({ latitude, longitude, speed: position.coords.speed ?? -1, accuracy: position.coords.accuracy, altitude: position.coords.altitude ?? 0, verticalAccuracy: 0, horizontalAccuracy: position.coords.accuracy })
    }, error => reject(new Error(error.code === error.PERMISSION_DENIED ? 'auth deny' : error.message)), { enableHighAccuracy: Boolean(options.isHighAccuracy), timeout: Number(options.highAccuracyExpireTime) || 10000 })
  })),
  chooseLocation: wxApi<Options, object>('chooseLocation', () => { throw new Error('chooseLocation is not available on the web') }),

  // ---- device ----
  makePhoneCall: wxApi<Options, object>('makePhoneCall', async options => {
    const phone = String(options.phoneNumber || '')
    if (!phone) throw new Error('phoneNumber is empty')
    const choice = await openActionSheet([`${systemText('call')} ${phone}`, systemText('copyNumber')])
    if (choice === 0) window.location.href = `tel:${phone}`
    else if (choice === 1) { await copyText(phone); showToast({ title: systemText('copied'), icon: 'none' }) }
    else throw { errMsg: 'makePhoneCall:fail cancel' }
    return {}
  }),
  setClipboardData: wxApi<Options, object>('setClipboardData', async options => {
    await copyText(String(options.data ?? ''))
    showToast({ title: systemText('copied'), icon: 'none' })
    return {}
  }),
  getClipboardData: wxApi<Options, object>('getClipboardData', async () => ({ data: await navigator.clipboard.readText() })),
  vibrateShort: wxApi<Options, object>('vibrateShort', () => { navigator.vibrate?.(15); return {} }),
  vibrateLong: wxApi<Options, object>('vibrateLong', () => { navigator.vibrate?.(400); return {} }),
  getSystemInfoSync: systemInfo,
  getSystemInfo: wxApi<Options, object>('getSystemInfo', systemInfo),
  getWindowInfo: () => { const info = systemInfo(); return { pixelRatio: info.pixelRatio, screenWidth: info.screenWidth, screenHeight: info.screenHeight, windowWidth: info.windowWidth, windowHeight: info.windowHeight, statusBarHeight: 0, safeArea: info.safeArea } },
  getDeviceInfo: () => { const info = systemInfo(); return { brand: info.brand, model: info.model, system: info.system, platform: info.platform, pixelRatio: info.pixelRatio } },
  getAppBaseInfo: () => ({ SDKVersion: '3.17.2', language: navigator.language, version: '8.0.50', theme: 'light', enableDebug: false }),
  getSystemSetting: () => ({ bluetoothEnabled: false, locationEnabled: Boolean(navigator.geolocation), wifiEnabled: true, deviceOrientation: 'portrait' }),
  getMenuButtonBoundingClientRect: () => { const { width } = rootSize(); return { width: 87, height: 32, top: 6, bottom: 38, left: width - 94, right: width - 7 } },
  canIUse: () => true,
  getAccountInfoSync: () => ({ miniProgram: { appId: 'web', envVersion: 'release', version: release } }),
  getLaunchOptionsSync: () => ({ path: state.stack[0]?.route || '', query: {}, scene: 1001, referrerInfo: {} }),
  getUpdateManager: () => ({ onCheckForUpdate() {}, onUpdateReady() {}, onUpdateFailed() {}, applyUpdate() { location.reload() } }),
  onAppShow: (listener: (options: unknown) => void) => { appListeners.show.add(listener) },
  offAppShow: (listener: (options: unknown) => void) => { appListeners.show.delete(listener) },
  onAppHide: (listener: () => void) => { appListeners.hide.add(listener) },
  offAppHide: (listener: () => void) => { appListeners.hide.delete(listener) },
  reportAnalytics: () => undefined,
  reportEvent: () => undefined,

  // ---- WeChat services a browser does not have ----
  login: wxApi<Options, object>('login', () => { throw new Error('WeChat login is not available on the web') }),
  requestPayment: wxApi<Options, object>('requestPayment', () => { throw { errMsg: `requestPayment:fail ${systemText('paymentUnavailable')}` } }),
  requestSubscribeMessage: wxApi<Options, object>('requestSubscribeMessage', () => { throw { errMsg: `requestSubscribeMessage:fail ${systemText('subscribeUnavailable')}` } }),
  showShareMenu: wxApi<Options, object>('showShareMenu', () => ({})),
  hideShareMenu: wxApi<Options, object>('hideShareMenu', () => ({})),
  updateShareMenu: wxApi<Options, object>('updateShareMenu', () => ({})),

  env: { USER_DATA_PATH: 'wxfile://usr' }
}

export type Wx = typeof wx
