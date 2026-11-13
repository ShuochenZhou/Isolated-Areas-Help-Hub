// Localize UI supplied by the web runtime, including menus, modal controls, notifications, and map
// sheets. Before the resident chooses a language, the runtime follows the browser locale.
import { getItem } from './storage'

const browserZh = typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '')

const TEXT = {
  ok: ['确定', 'OK'],
  cancel: ['取消', 'Cancel'],
  copied: ['内容已复制', 'Copied'],
  call: ['呼叫', 'Call'],
  copyNumber: ['复制号码', 'Copy number'],
  back: ['返回', 'Back'],
  home: ['首页', 'Home'],
  share: ['分享', 'Share'],
  copyLink: ['复制链接', 'Copy link'],
  linkCopied: ['链接已复制', 'Link copied'],
  restart: ['重新进入小程序', 'Restart'],
  about: ['关于网页版', 'About the web version'],
  aboutText: [
    '这是邻需通小程序的网页版：页面、样式和业务逻辑都来自小程序本身的原始代码，只替换了与微信交互的部分（登录、地图、支付等）。',
    'This is the web version of the Help Hub WeChat application: its pages, styles and logic are the WeChat application\'s own code; only the parts that talk to WeChat (sign-in, maps, payment) are replaced.'
  ],
  navigateWith: ['选择导航方式', 'Navigate with'],
  amap: ['高德地图', 'Amap'],
  googleMaps: ['Google 地图', 'Google Maps'],
  appleMaps: ['Apple 地图', 'Apple Maps'],
  close: ['关闭', 'Close'],
  pullToRefresh: ['下拉刷新', 'Pull to refresh'],
  releaseToRefresh: ['松开刷新', 'Release to refresh'],
  paymentUnavailable: ['网页版暂不支持微信支付', 'WeChat Pay is not available on the web'],
  subscribeUnavailable: ['网页版暂不支持微信订阅消息', 'WeChat reminders are not available on the web'],
  mapSource: ['地图数据 © 高德', 'Map data © AutoNavi'],
  mapSourceOsm: ['地图数据 © OpenStreetMap · CARTO', 'Map data © OpenStreetMap · CARTO'],
  loading: ['加载中', 'Loading'],
  errorTitle: ['出错了', 'Something went wrong']
} as const

export type SystemTextKey = keyof typeof TEXT

/** The WeChat application's chosen language (utils/i18n.js keeps it under "language"), else the browser's. */
export function systemLanguage(): 'zh' | 'en' {
  const chosen = getItem('language')
  if (chosen === 'en' || chosen === 'zh') return chosen
  return browserZh ? 'zh' : 'en'
}

// Read when the text is shown, so a language picked (or switched by the assistant) applies at once.
export function systemText(key: SystemTextKey): string {
  return TEXT[key][systemLanguage() === 'zh' ? 0 : 1]
}
