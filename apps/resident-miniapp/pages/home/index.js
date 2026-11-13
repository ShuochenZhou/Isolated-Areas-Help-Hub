const { request } = require('../../utils/request')
const { readPlace, ensureDefaultPlace, placeLabel, placeKey } = require('../../utils/place')
const config = require('../../config')
const { productsFrom } = require('../../utils/products')
const { requestStatusName, servicePointStatusName, openingHours, dateTime, userMessage } = require('../../utils/display')
const { shareToFriends, shareToTimeline } = require('../../utils/share')
const { lang, L, pick, setLang, isRemembered, leavingBriefly, setTitle, applyTabBar } = require('../../utils/i18n')
const { translate, unitName } = require('../../utils/translate')

const TEXT = {
  zh: {
    heroTitle: '让日常补给，离每个人更近',
    heroCopy: '查看服务点与免费物资，提交需求后可选择到点自取或补给车配送，并随时跟进处理进度。',
    submitNeed: '提交需求', askAssistant: '问智能助手', syncing: '正在同步社区服务数据…', reload: '重新加载',
    nearby: '附近服务', viewMap: '查看地图 →', currentPlace: '当前位置',
    defaultPlaceHint: '（默认位置，设置后可计算真实距离）', change: '修改', set: '设置', retry: '重试',
    pickupHours: '自取营业时间', noPoints: '10 公里内暂无固定服务点，请查看移动服务车。',
    inventoryTitle: '可用物资 · 公益免费', requestLink: '申请物资 →', tapToApply: '点击申请',
    noInventory: '当前暂无可申请的物资', recent: '最近进度', allRequests: '全部申请 →', quantity: '数量',
    noRequests: '还没有申请记录', releaseName: '邻需通', releaseNote: '所有物资公益免费'
  },
  en: {
    heroTitle: 'Bringing daily supplies closer to everyone',
    heroCopy: 'See service points and free supplies. After you submit a request, choose pickup at a service point or delivery by supply cart, and follow its progress anytime.',
    submitNeed: 'New Request', askAssistant: 'Ask Assistant', syncing: 'Syncing community service data…', reload: 'Reload',
    nearby: 'Nearby Services', viewMap: 'View map →', currentPlace: 'Your location',
    defaultPlaceHint: ' (default location; set yours to see real distances)', change: 'Change', set: 'Set', retry: 'Retry',
    pickupHours: 'Pickup hours', noPoints: 'No service points within 10 km. Please check the mobile supply carts.',
    inventoryTitle: 'Available Supplies · Free', requestLink: 'Request →', tapToApply: 'Tap to request',
    noInventory: 'No supplies available to request right now', recent: 'Recent Requests', allRequests: 'All requests →', quantity: 'Qty',
    noRequests: 'No requests yet', releaseName: 'Help Hub', releaseNote: 'All supplies are free'
  }
}

Page({
  onShareAppMessage: shareToFriends,
  onShareTimeline: shareToTimeline,
  data: { t: TEXT.zh, showLanguagePicker: false, rememberLanguage: false, releaseId: config.releaseId, loading: true, points: [], inventory: [], requests: [], placeLabel: '', placeConfirmed: false, nearbyError: '', loadError: '' },
  onLoad() {
    // Every launch opens on this page with the language picker, unless the resident made their
    // choice the default; the page loads underneath it.
    const choosing = !getApp().globalData.languageChosen && !isRemembered()
    this.setData({ t: pick(TEXT), showLanguagePicker: choosing })
    this.renderedLanguage = lang()
    setTitle('邻需通', 'Help Hub')
    applyTabBar()
    // Keep the first screen renderable even when a phone uses an older JSCore or
    // one of the startup requests fails before it reaches its normal callback.
    this.load().catch(error => this.finishLoadWithError(error))
  },
  onShow() {
    // The picker covers the page, and the tab bar would sit on top of it.
    if (this.data.showLanguagePicker) wx.hideTabBar({ fail() {} })
    if (this.data.loading) return
    // A place picked on pages/place while this tab was hidden changes the distances.
    const tasks = [this.loadRequests()]
    if (this.placeKey !== placeKey(readPlace())) tasks.push(this.loadNearby())
    Promise.all(tasks).catch(error => this.setData({ loadError: userMessage(error, L('最近进度加载失败，请重试', 'Could not load recent requests. Please try again.')) }))
  },
  chooseLanguage(e) {
    setLang(e.currentTarget.dataset.language, this.data.rememberLanguage)
    getApp().globalData.languageChosen = true
    wx.showTabBar({ fail() {} })
    setTitle('邻需通', 'Help Hub')
    this.setData({ t: pick(TEXT), showLanguagePicker: false })
    // What was loaded under the picker was written in the previous language.
    if (lang() !== this.renderedLanguage) {
      this.renderedLanguage = lang()
      this.load().catch(error => this.finishLoadWithError(error))
    }
  },
  toggleRemember() { this.setData({ rememberLanguage: !this.data.rememberLanguage }) },
  noop() {},
  onPullDownRefresh() {
    const stop = () => wx.stopPullDownRefresh()
    this.load().then(stop, stop)
  },
  load() {
    this.setData({ loading: true, loadError: '' })
    // Some real-phone WeChat JSCore/base-library combinations lack the newer
    // settled-promise aggregation API even when DevTools supports it.
    const settle = task => Promise.resolve(task).then(
      () => ({ fulfilled: true }),
      error => ({ fulfilled: false, error })
    )
    return Promise.all([
      settle(this.loadNearby()),
      settle(this.loadInventory()),
      settle(this.loadRequests())
    ]).then(results => {
      const failure = results.find(result => !result.fulfilled)
      this.setData({ loading: false, loadError: failure ? userMessage(failure.error, L('部分内容加载失败，请重试', 'Some content failed to load. Please try again.')) : '' })
    }).catch(error => this.finishLoadWithError(error))
  },
  finishLoadWithError(error) {
    this.setData({ loading: false, loadError: userMessage(error, L('页面初始化失败，请点击重新加载', 'The page failed to load. Tap Reload.')) })
  },
  async loadNearby() {
    await ensureDefaultPlace()
    const place = readPlace()
    this.placeKey = placeKey(place)
    this.setData({ placeLabel: placeLabel(place), placeConfirmed: place.confirmed })
    getApp().globalData.location = { latitude: place.latitude, longitude: place.longitude }
    const points = await request({ url: `/resident/service-points?latitude=${place.latitude}&longitude=${place.longitude}&radiusMeters=10000` })
    // Distances from the fallback point would be the same made-up number for every
    // service point, so they are only shown once the resident has picked a place.
    this.setData({ points: points.slice(0, 3).map(point => ({
      ...point,
      name: translate(point.name),
      address: translate(point.address),
      statusName: servicePointStatusName(point.status),
      hoursText: openingHours(point),
      distanceText: !place.confirmed ? L('设置位置后显示距离', 'Set your location to see the distance')
        : point.distanceMeters < 1000
          ? L(`距你约 ${Math.round(point.distanceMeters)} 米`, `About ${Math.round(point.distanceMeters)} m away`)
          : L(`距你约 ${(point.distanceMeters / 1000).toFixed(1)} 公里`, `About ${(point.distanceMeters / 1000).toFixed(1)} km away`)
    })), nearbyError: '' })
  },
  async loadInventory() {
    // One card per product, listing how much each service point holds.
    const inventory = await request({ url: '/resident/inventory' })
    // The cards are narrow: in English the unit sits by the big number once ("23 pieces"), and each
    // service point line shows just its count, which otherwise wrapped into two broken lines.
    this.setData({ inventory: productsFrom(inventory, config.paymentsEnabled).filter(product => product.totalFree > 0)
      .map(product => ({
        ...product,
        stockText: L(`${product.unit} 可领`, unitName(product.unit, product.totalFree)),
        points: product.points.map(point => ({ ...point, freeText: L(point.freeText, String(point.free)) }))
      })) })
  },
  async loadRequests() {
    const requests = await request({ url: '/resident/requests?limit=3' })
    this.setData({ requests: requests.map(item => ({ ...item, itemDescription: translate(item.itemDescription), statusName: requestStatusName(item.status), createdText: dateTime(item.createdAt) })) })
  },
  retryNearby() { this.setData({ nearbyError: '' }); this.loadNearby().catch(error => this.setData({ nearbyError: userMessage(error, L('服务点加载失败', 'Could not load service points')) })) },
  editPlace() { wx.navigateTo({ url: '/pages/place/index' }) },
  openPoint(e) {
    const point = this.data.points.find(item => Number(item.id) === Number(e.currentTarget.dataset.id))
    if (!point) return
    leavingBriefly()
    wx.openLocation({ latitude: Number(point.latitude), longitude: Number(point.longitude), name: point.name, address: point.address, scale: 16 })
  },
  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }) },
  // The request form is a tab page, so the chosen product travels through globalData.
  requestProduct(e) {
    getApp().globalData.preselectProduct = e.currentTarget.dataset.key
    wx.switchTab({ url: '/pages/request-create/index' })
  },
  tab(e) { wx.switchTab({ url: e.currentTarget.dataset.url }) }
})
