// Boots the WeChat application in the browser: the runtime supplies what WeChat would (Page, App,
// getApp, wx, getCurrentPages), runs app.js, opens the entry page and mounts the window.
import { createApp } from 'vue'
import './styles/wx-base.css'
import 'virtual:miniapp-styles.css'
import './styles/shell.css'
import { defineApp, getAppInstance, reportError } from './app'
import { hoverDirective } from './components/hover'
import WxButton from './components/WxButton.vue'
import WxIcon from './components/WxIcon.vue'
import WxImage from './components/WxImage.vue'
import WxInput from './components/WxInput.vue'
import WxMap from './components/WxMap.vue'
import WxNavigator from './components/WxNavigator.vue'
import WxPicker from './components/WxPicker.vue'
import WxScrollView from './components/WxScrollView.vue'
import WxTextarea from './components/WxTextarea.vue'
import { EMBEDDED } from './env'
import { installModuleGlobals, requireModule } from './modules'
import { definePage } from './page'
import { currentPages, launch } from './router'
import AppShell from './shell/AppShell.vue'
import { wx } from './wx'

const unsupported = (name: string) => () => { throw new Error(`${name}() custom components are not used by this WeChat application`) }

installModuleGlobals({
  Page: route => options => definePage(route, options),
  App: options => defineApp(options),
  getApp: () => getAppInstance(),
  wx,
  getCurrentPages: currentPages,
  Component: unsupported('Component'),
  Behavior: unsupported('Behavior'),
  global: {}
})

if (!EMBEDDED) document.body.classList.add('wx-standalone')

const app = createApp(AppShell)
app.config.errorHandler = error => reportError(error)
app.directive('wx-hover', hoverDirective)
app.component('wx-button', WxButton)
app.component('wx-input', WxInput)
app.component('wx-textarea', WxTextarea)
app.component('wx-picker', WxPicker)
app.component('wx-scroll-view', WxScrollView)
app.component('wx-map', WxMap)
app.component('wx-image', WxImage)
app.component('wx-icon', WxIcon)
app.component('wx-navigator', WxNavigator)

try {
  requireModule('app.js')
  launch()
} catch (error) {
  reportError(error)
}
app.mount('#app')
