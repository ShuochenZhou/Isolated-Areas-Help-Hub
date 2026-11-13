const config = require('./config')
const { callApi } = require('./utils/cloud')
const { L, localError, modal, isRemembered } = require('./utils/i18n')

// Back within this long is the same visit, not a new one.
const SAME_VISIT_MS = 3 * 60 * 1000

function loginError(error, fallback = L('登录服务暂时不可用', 'Sign-in is unavailable right now')) {
  if (error instanceof Error) return error
  const message = error && (error.errMsg || error.message)
  if (message && /timeout/i.test(message)) return localError('登录请求超时，请检查网络后重试', 'Sign-in timed out. Please check your network and try again.')
  if (message && /fail/i.test(message)) return localError('无法连接服务，请检查后端是否运行', "Can't reach the service. Please try again later.")
  return new Error(message || fallback)
}

App({
  globalData: { token: '', user: null, location: null, loginError: '', languageChosen: false, leavingBriefly: false },
  // A fatal error in an uploaded build renders as a blank screen with no other
  // signal, so surface it where it can actually be read.
  onError(error) {
    modal({ title: L('启动错误', 'Startup error'), content: String(error).slice(0, 500), showCancel: false })
  },
  onHide() { this.wasHidden = true; this.hiddenAt = Date.now() },
  // WeChat keeps a closed WeChat application alive in the background for a while, so coming back does
  // not start it again. A return counts as a new visit and asks for the language on the home
  // page, unless the resident made a language the default, only stepped out to the map, a phone
  // call, payment or sharing, or was away just a moment (e.g. to copy an address from a chat),
  // which must not throw away a half-filled form. A cold start is handled by the home page itself.
  onShow() {
    if (!this.wasHidden) return
    this.wasHidden = false
    const brief = this.globalData.leavingBriefly || Date.now() - (this.hiddenAt || 0) < SAME_VISIT_MS
    this.globalData.leavingBriefly = false
    if (brief || isRemembered()) return
    this.globalData.languageChosen = false
    wx.reLaunch({ url: '/pages/home/index' })
  },
  onLaunch() {
    if (wx.cloud && typeof wx.cloud.init === 'function') {
      wx.cloud.init({ env: config.cloudEnv, traceUser: true })
    }
    this.globalData.token = wx.getStorageSync('accessToken') || ''
    this.globalData.user = wx.getStorageSync('currentUser') || null
    // Attach a handler here so an unavailable backend does not create an unhandled
    // rejection in DevTools. Individual page requests still surface the error.
    this.ensureLogin().catch(error => { this.globalData.loginError = error.message })
  },
  ensureLogin(force = false) {
    if (!force && this.globalData.token) return Promise.resolve(this.globalData.user)
    if (this.loginPromise) return this.loginPromise
    if (force) {
      this.globalData.token = ''
      wx.removeStorageSync('accessToken')
    }
    const pending = new Promise((resolve, reject) => {
      const complete = (path, data) => callApi({
        path,
        method: 'POST',
        timeout: 15000,
        data,
      }).then(({ statusCode, data: body }) => {
          if (statusCode < 200 || statusCode >= 300) {
            return reject(new Error(body && (body.detail || body.message) || L(`登录失败 (${statusCode})`, `Sign-in failed (${statusCode})`)))
          }
          this.globalData.token = body.accessToken
          this.globalData.user = { userId: body.userId, displayName: body.displayName, role: body.role }
          this.globalData.loginError = ''
          wx.setStorageSync('accessToken', body.accessToken)
          wx.setStorageSync('currentUser', this.globalData.user)
          resolve(this.globalData.user)
        }).catch(error => reject(loginError(error)))
      if (config.useDevLogin) return complete('/auth/dev-login', { phone: config.devPhone })
      return complete('/auth/cloudrun', { displayName: '社区居民' })
    })
    this.loginPromise = pending
    const clearPending = () => { if (this.loginPromise === pending) this.loginPromise = null }
    pending.then(clearPending, clearPending)
    return pending
  }
})
