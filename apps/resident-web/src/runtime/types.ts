export interface WindowConfig {
  navigationBarTitleText?: string
  navigationBarBackgroundColor?: string
  navigationBarTextStyle?: 'black' | 'white'
  navigationStyle?: 'default' | 'custom'
  backgroundColor?: string
  backgroundTextStyle?: 'dark' | 'light'
  enablePullDownRefresh?: boolean
  onReachBottomDistance?: number
  disableScroll?: boolean
}

export interface TabBarItem { pagePath: string; text: string; iconPath?: string; selectedIconPath?: string }

export interface AppConfig {
  pages: string[]
  window?: WindowConfig
  tabBar?: { color?: string; selectedColor?: string; backgroundColor?: string; borderStyle?: 'black' | 'white'; list: TabBarItem[] }
  [key: string]: unknown
}

export interface PageJson extends WindowConfig { usingComponents?: Record<string, string> }

/** A WeChat application event as page methods receive it. */
export interface WxEvent {
  type: string
  timeStamp: number
  target: { id: string; dataset: Record<string, unknown>; offsetLeft: number; offsetTop: number }
  currentTarget: { id: string; dataset: Record<string, unknown>; offsetLeft: number; offsetTop: number }
  detail: Record<string, unknown>
  mark: Record<string, unknown>
  touches: unknown[]
  changedTouches: unknown[]
  [key: string]: unknown
}

/** What runtime components emit: WeChat's event detail, plus the DOM event when there is one. */
export interface ComponentEvent {
  type: string
  detail: Record<string, unknown>
  native?: Event
  /** Extra top-level fields of the WeChat event (e.g. regionchange's causedBy). */
  extra?: Record<string, unknown>
  /** Receives the handler's return value (an input's bindinput may return the new value). */
  respond?: (result: unknown) => void
}
