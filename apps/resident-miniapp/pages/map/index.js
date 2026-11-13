const { request } = require('../../utils/request')
const { readPlace, ensureDefaultPlace, placeLabel, placeKey } = require('../../utils/place')
const { servicePointStatusName, cartStatusName, openingHours, dateTime, userMessage } = require('../../utils/display')
const { L, pick, setTitle, leavingBriefly, applyTabBar } = require('../../utils/i18n')
const { translate } = require('../../utils/translate')

const TEXT = {
  zh: {
    pointLegend: '服务点（自取）', cartLegend: '补给车（配送）', meLegend: '我的位置', loading: '正在获取服务位置…', showAll: '查看全部',
    placePrefix: '当前位置：', defaultSuffix: '（默认）', changePlace: '修改位置', setPlace: '设置我的位置',
    reload: '重新加载', empty: '暂无可显示的服务位置', navigate: '在微信地图中导航', placeOwnLine: false
  },
  en: {
    pointLegend: 'Service point (pickup)', cartLegend: 'Supply cart (delivery)', meLegend: 'You', loading: 'Loading service locations…', showAll: 'Show all',
    placePrefix: 'Your location: ', defaultSuffix: ' (default)', changePlace: 'Change location', setPlace: 'Set my location',
    reload: 'Reload', empty: 'No service locations to show', navigate: 'Navigate in WeChat Maps',
    // The longer English line would otherwise wrap around the button.
    placeOwnLine: true
  }
}

const REFRESH_MS = 5000
const CART_MARKER_BASE = 100000
const DESTINATION_MARKER_ID = 200000
const PLACE_MARKER_ID = 300000

// Carts are often parked at a service point; within this distance the two icons are drawn
// side by side (anchored on the same real coordinate) instead of on top of each other.
function sameSpot(a, b) {
  return Math.abs(Number(a.latitude) - Number(b.latitude)) < 0.0003 && Math.abs(Number(a.longitude) - Number(b.longitude)) < 0.0003
}

function toPoints(path) {
  return (path || []).map(([latitude, longitude]) => ({ latitude, longitude }))
}
const { shareToFriends } = require('../../utils/share')

Page({
  onShareAppMessage: shareToFriends,
  data: {
    t: TEXT.zh, latitude: 31.1665, longitude: 121.1111, points: [], carts: [], markers: [], polyline: [], selected: null,
    loading: true, placeLabel: '', placeConfirmed: false, error: '', tracking: null
  },
  onLoad() {
    // Opened first (a refreshed web page, a link from a notification), the tab labels must not stay
    // in the default Chinese; the home page is not the only way in.
    applyTabBar()
    this.setData({ t: pick(TEXT) })
    setTitle('服务地图', 'Service Map')
    this.load()
  },
  onReady() { this.mapContext = wx.createMapContext('serviceMap', this) },
  onShow() {
    const app = getApp()
    if (app.globalData.trackingRequestId) {
      this.trackingId = app.globalData.trackingRequestId
      app.globalData.trackingRequestId = null
      this.centredOnTracking = false
      this.refresh()
    } else if (!this.data.loading && this.placeKey && this.placeKey !== placeKey(readPlace())) {
      // Returning from the picker should recentre the map on the new reference point.
      this.load()
    }
    this.startRefreshing()
  },
  onHide() { this.stopRefreshing() },
  onUnload() { this.stopRefreshing() },
  startRefreshing() {
    this.stopRefreshing()
    this.timer = setInterval(() => this.refresh(), REFRESH_MS)
  },
  stopRefreshing() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },
  async load() {
    this.setData({ loading: true, error: '', selected: null })
    await ensureDefaultPlace()
    const place = readPlace()
    this.placeKey = placeKey(place)
    this.place = place
    this.setData({ placeLabel: placeLabel(place), placeConfirmed: place.confirmed, latitude: place.latitude, longitude: place.longitude })
    try {
      const points = await request({ url: `/resident/service-points?latitude=${place.latitude}&longitude=${place.longitude}&radiusMeters=50000` })
      this.setData({
        points: points.map(point => ({
          ...point, name: translate(point.name), address: translate(point.address), statusName: servicePointStatusName(point.status),
          detail: `${translate(point.address)}${openingHours(point) ? ` · ${L('自取营业时间', 'Pickup hours')} ${openingHours(point)}` : ''}`
        }))
      })
      await this.refresh()
      this.showAll()
    } catch (error) { this.setData({ error: userMessage(error, L('地图数据加载失败，请重试', 'Could not load map data. Please try again.')) }) }
    finally { this.setData({ loading: false }) }
  },
  // Carts move along simulated routes, so their positions are re-read every few seconds.
  async refresh() {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const [carts, tracking] = await Promise.all([
        request({ url: '/resident/carts' }),
        this.trackingId ? request({ url: `/resident/requests/${this.trackingId}/tracking` }).catch(() => null) : Promise.resolve(null)
      ])
      this.render(carts.map(cart => ({ ...cart, name: translate(cart.name), statusText: translate(cart.statusText) })),
        tracking && { ...tracking, cartName: translate(tracking.cartName), statusText: translate(tracking.statusText) })
    } catch (error) {
      if (!this.data.carts.length) this.setData({ error: userMessage(error, L('补给车位置加载失败', 'Could not load supply cart locations')) })
    } finally { this.refreshing = false }
  },
  render(carts, tracking) {
    const points = this.data.points
    const located = carts.filter(cart => cart.latitude && cart.longitude)
    const pointMarkers = points.map(point => ({
      id: Number(point.id), latitude: Number(point.latitude), longitude: Number(point.longitude), title: point.name,
      iconPath: '/images/marker-point.png', width: 32, height: 32,
      anchor: located.some(cart => !cart.moving && sameSpot(cart, point)) ? { x: 1, y: 0.5 } : { x: 0.5, y: 0.5 },
      callout: { content: ` ${point.name} `, display: 'BYCLICK', padding: 8, borderRadius: 8 }
    }))
    const cartMarkers = located.map(cart => ({
      id: CART_MARKER_BASE + Number(cart.id), latitude: Number(cart.latitude), longitude: Number(cart.longitude), title: cart.name,
      iconPath: '/images/marker-cart.png', width: 32, height: 32,
      anchor: !cart.moving && points.some(point => sameSpot(cart, point)) ? { x: 0, y: 0.5 } : { x: 0.5, y: 0.5 },
      callout: { content: ` ${cart.name} · ${cart.statusText || cartStatusName(cart.status)} `, display: cart.moving ? 'ALWAYS' : 'BYCLICK', padding: 8, borderRadius: 8 }
    }))
    const polyline = located.filter(cart => cart.moving && cart.path && cart.path.length > 1)
      .map(cart => ({ points: toPoints(cart.path), color: '#E07A3F99', width: 4, dottedLine: true }))
    const markers = pointMarkers.concat(cartMarkers)
    // Where the resident is, so the distances on the home page can be seen on the map too.
    const place = this.place
    if (place) {
      markers.push({
        id: PLACE_MARKER_ID, latitude: Number(place.latitude), longitude: Number(place.longitude), title: L('我的位置', 'My location'),
        iconPath: '/images/marker-me.png', width: 26, height: 26, anchor: { x: 0.5, y: 0.5 },
        callout: { content: L(' 我的位置 ', ' My location '), display: 'BYCLICK', padding: 6, borderRadius: 8 }
      })
    }
    let trackingView = null
    if (tracking) {
      polyline.push({ points: toPoints(tracking.path), color: '#246B58', width: 6, arrowLine: true })
      markers.push({
        id: DESTINATION_MARKER_ID, latitude: tracking.destinationLatitude, longitude: tracking.destinationLongitude,
        title: L('送达位置', 'Delivery location'), width: 26, height: 26, iconPath: '/images/marker-point.png',
        callout: { content: L(' 你的送达位置 ', ' Your delivery location '), display: 'ALWAYS', padding: 6, borderRadius: 8 }
      })
      // Keep only the time component from the localized date-time label.
      const arrival = L(dateTime(tracking.estimatedArrival).split(' ')[1], dateTime(tracking.estimatedArrival).split(' ').pop())
      trackingView = {
        cartName: tracking.cartName,
        text: tracking.delivered ? L('已送达，本次服务已完成', 'Delivered. This request is complete.')
          : L(`${tracking.statusText} · 预计 ${arrival} 送达`, `${tracking.statusText} · arriving around ${arrival}`)
      }
    }
    const data = {
      error: '',
      carts: carts.map(cart => ({
        ...cart, statusName: cart.moving ? cart.statusText : cartStatusName(cart.status),
        detail: cart.moving
          ? L(`${cart.statusText}（位置按估算车速实时模拟）`, `${cart.statusText} (position simulated from estimated speed)`)
          : L(`停靠中${cart.observedAt ? `（${dateTime(cart.observedAt)} 更新）` : ''}，有配送需求时自动出发`,
            `Parked${cart.observedAt ? ` (updated ${dateTime(cart.observedAt)})` : ''}; sets off automatically when there is a delivery`)
      })),
      markers, polyline, tracking: trackingView
    }
    if (tracking && !this.centredOnTracking) {
      this.centredOnTracking = true
      data.latitude = tracking.latitude
      data.longitude = tracking.longitude
    }
    this.setData(data)
  },
  // At the default scale the map shows about a kilometre around the resident, where there is
  // often no service point at all; frame the service points and the resident's place together.
  // The top padding keeps them clear of the legend and the location card.
  showAll() {
    const points = this.data.points.map(point => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) }))
    // While following a delivery the map stays on the cart.
    if (!points.length || !this.mapContext || this.trackingId) return
    if (this.place) points.push({ latitude: Number(this.place.latitude), longitude: Number(this.place.longitude) })
    this.mapContext.includePoints({ points, padding: [150, 50, 60, 50], fail() {} })
  },
  stopTracking() {
    this.trackingId = null
    this.setData({ tracking: null })
    this.refresh().then(() => this.showAll())
  },
  editPlace() { wx.navigateTo({ url: '/pages/place/index' }) },
  markerTap(e) {
    const id = Number(e.detail.markerId)
    if (id === DESTINATION_MARKER_ID || id === PLACE_MARKER_ID) return
    const selected = id >= CART_MARKER_BASE ? this.data.carts.find(x => Number(x.id) === id - CART_MARKER_BASE) : this.data.points.find(x => Number(x.id) === id)
    this.setData({ selected })
  },
  openNavigation() {
    const item = this.data.selected
    if (!item) return
    leavingBriefly()
    wx.openLocation({ latitude: Number(item.latitude), longitude: Number(item.longitude), name: item.name, address: item.address || L('补给车当前模拟位置', 'Simulated current position of the supply cart'), scale: 16 })
  }
})
