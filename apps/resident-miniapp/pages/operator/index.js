const config = require('../../config')
const { callApi } = require('../../utils/cloud')
const { categoryName, urgencyName, requestStatusName, fulfillmentName, dateTime, userMessage } = require('../../utils/display')

const { windowText } = require('../../utils/schedule')
const { L, pick, setTitle, modal, localError, leavingBriefly } = require('../../utils/i18n')
const { translate, term, amount } = require('../../utils/translate')

const STOP_NAMES = { PICKUP: ['取货', 'Collect'], DROPOFF: ['送达', 'Deliver'], RETURN: ['返回', 'Return'] }
const LEG_STATES = { DONE: ['已完成', 'Done'], CURRENT: ['当前这一段', 'Current leg'], UPCOMING: ['待前往', 'Upcoming'] }

function named(map, key) { return map[key] ? L(map[key][0], map[key][1]) : key }

const TEXT = {
  zh: {
    loginTitle: '授权运营人员登录', loginHint: '居民无需进入此页面。', account: '账号', accountPlaceholder: '例如 kd001',
    password: '运营密码', signIn: '登录运营台', courier: '快递员', admin: '管理员', refresh: '刷新',
    myRoute: '我的配送路线', everyTenSeconds: ' · 每 10 秒刷新', noLegs: '有新的配送单时，系统会自动把路线派给你，这里会显示每一段怎么走。',
    legBefore: '第 ', legAfter: ' 段', fromBefore: '从 ', fromAfter: ' 出发', etaBefore: '预计 ', etaAfter: ' 到达', address: '地址：', navigate: '导航到这里',
    allTrips: '全部补给车行程', onTheRoad: ' 辆在途', noTrips: '当前没有补给车在途。有已锁定库存的配送需求时，系统会在 1 分钟内自动派出离取货点最近的车。',
    myDeliveries: '我的配送单', openRequests: '待处理需求', countSuffix: ' 条', noDeliveries: '目前没有分配给你的配送单。',
    quantity: '数量', noAddress: '未填地址', approve: '批准', reject: '拒绝', assignPoint: '安排服务点',
    autoDispatch: '锁定库存后自动派车', markDelivered: '标记已送达', markCollected: '标记已领取', cancel: '取消',
    verifyTitle: '领取 / 送达核销', verifyHint: '只需输入居民的领取码', codeLabel: '6 位领取码', verify: '确认核销',
    stockTitle: '青浦公益库存', itemsSuffix: ' 项'
  },
  en: {
    loginTitle: 'Authorised Staff Sign-in', loginHint: "Residents don't need this page.", account: 'Account', accountPlaceholder: 'e.g. kd001',
    password: 'Operator password', signIn: 'Sign in to console', courier: 'Courier', admin: 'Administrator', refresh: 'Refresh',
    myRoute: 'My Delivery Route', everyTenSeconds: ' · refreshes every 10 s', noLegs: "When there's a new delivery, the route is assigned to you automatically and each leg is shown here.",
    legBefore: 'Leg ', legAfter: '', fromBefore: 'From ', fromAfter: '', etaBefore: 'arriving around ', etaAfter: '', address: 'Address: ', navigate: 'Navigate here',
    allTrips: 'All Supply Cart Trips', onTheRoad: ' on the road', noTrips: 'No supply carts are on the road. When a delivery has reserved stock, the cart nearest the pickup point is sent automatically within a minute.',
    myDeliveries: 'My Deliveries', openRequests: 'Open Requests', countSuffix: '', noDeliveries: 'No deliveries are assigned to you right now.',
    quantity: 'Qty', noAddress: 'No address', approve: 'Approve', reject: 'Decline', assignPoint: 'Assign service point',
    autoDispatch: 'A cart is sent automatically once stock is reserved', markDelivered: 'Mark delivered', markCollected: 'Mark collected', cancel: 'Cancel',
    verifyTitle: 'Verify Pickup / Delivery', verifyHint: "Just enter the resident's code", codeLabel: '6-digit pickup code', verify: 'Verify',
    stockTitle: 'Qingpu Free Stock', itemsSuffix: ' items'
  }
}

Page({
  data: {
    t: TEXT.zh, phone: '', password: '', token: '', loggingIn: false, loading: false,
    account: '', role: '', isCourier: false, releaseId: config.releaseId,
    requests: [], inventory: [], servicePoints: [], carts: [],
    myRoute: { assigned: false, legs: [] }, myRouteMarkers: [], myRouteLines: [], myRoutePoints: [],
    trips: [], tripMarkers: [], tripLines: [], mapLatitude: 31.1665, mapLongitude: 121.1111,
    pickupCode: ''
  },
  onLoad() {
    this.setData({ t: pick(TEXT) })
    setTitle('公益运营', 'Operations')
  },
  bind(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  async api(path, method = 'GET', data) {
    const response = await callApi({
      path, method, data, timeout: 15000,
      header: { Authorization: `Bearer ${this.data.token}`, 'Content-Type': 'application/json' }
    })
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(response.data && (response.data.detail || response.data.message) || L(`请求失败 (${response.statusCode})`, `Request failed (${response.statusCode})`))
    }
    return response.data
  },
  async login() {
    if (this.data.loggingIn || !this.data.password) return
    this.setData({ loggingIn: true })
    try {
      const response = await callApi({
        path: '/auth/operator-login', method: 'POST', timeout: 15000,
        data: { phone: this.data.phone.trim(), password: this.data.password }
      })
      // Couriers and service-point staff sign in as OPERATOR; the programme administrator as ADMIN.
      if (response.statusCode !== 200 || !['ADMIN', 'OPERATOR'].includes(response.data.role)) throw localError('账号或运营密码错误', 'Incorrect account or operator password')
      this.setData({ token: response.data.accessToken, password: '', account: this.data.phone.trim(), role: response.data.role })
      // Couriers see only their own cart, so find out whether this account drives one first.
      await this.loadMyRoute()
      await this.load()
      this.startTrips()
    } catch (error) { wx.showToast({ title: userMessage(error, L('登录失败', 'Sign-in failed')), icon: 'none' }) }
    finally { this.setData({ loggingIn: false }) }
  },
  async load() {
    if (!this.data.token || this.data.loading) return
    this.setData({ loading: true })
    try {
      const [requests, inventory, servicePoints, carts] = await Promise.all([
        this.api('/admin/requests?limit=100'), this.api('/admin/inventory'),
        this.api('/resident/service-points?latitude=31.1665&longitude=121.1111&radiusMeters=50000'),
        this.api('/resident/carts')
      ])
      this.setData({
        requests: requests.filter(item => !['FULFILLED', 'REJECTED', 'CANCELLED'].includes(item.status)).map(item => ({
          ...item, statusName: requestStatusName(item.status), categoryName: categoryName(item.category),
          urgencyName: urgencyName(item.urgency), methodName: fulfillmentName(item.fulfillmentMethod),
          whenText: windowText(item.preferredStart, item.preferredEnd),
          assignedText: translate(item.assignedServicePointName || item.assignedCartName || ''),
          itemDescription: translate(item.itemDescription), residentName: term(item.residentName),
          approximateAddress: translate(item.approximateAddress), accessibilityNotes: translate(item.accessibilityNotes)
        })),
        servicePoints: servicePoints.map(point => ({ ...point, name: translate(point.name) })),
        carts: carts.map(cart => ({ ...cart, name: translate(cart.name) })),
        inventory: inventory.filter(item => item.sku.indexOf('QP-') === 0).map(item => ({
          ...item, name: term(item.name), servicePointName: translate(item.servicePointName),
          freeText: L(`可领 ${item.freeQuantity} ${item.unit}`, `${amount(item.freeQuantity, item.unit)} available`)
        }))
      })
    } catch (error) { wx.showToast({ title: userMessage(error, L('运营数据加载失败', 'Could not load operations data')), icon: 'none' }) }
    finally { this.setData({ loading: false }) }
  },
  onHide() { this.stopTrips() },
  onUnload() { this.stopTrips() },
  onShow() { if (this.data.token) this.startTrips() },
  startTrips() {
    this.stopTrips()
    this.loadTrips()
    this.tripTimer = setInterval(() => this.loadTrips(), 10000)
  },
  stopTrips() { if (this.tripTimer) clearInterval(this.tripTimer); this.tripTimer = null },
  async loadTrips() {
    if (!this.data.token) return
    this.loadMyRoute()
    try {
      const trips = (await this.api('/admin/trips')).map(trip => ({
        ...trip, cartName: translate(trip.cartName), statusText: translate(trip.statusText),
        stops: trip.stops.map(stop => ({ ...stop, label: translate(stop.label) }))
      }))
      this.setData({
        trips: trips.map(trip => ({
          ...trip,
          stops: trip.stops.map(stop => ({ ...stop, typeName: named(STOP_NAMES, stop.type), etaText: dateTime(stop.arriveAt), done: stop.status === 'DONE' }))
        })),
        tripMarkers: trips.map(trip => ({
          id: Number(trip.cartId), latitude: trip.latitude, longitude: trip.longitude, iconPath: '/images/marker-cart.png', width: 30, height: 30,
          callout: { content: ` ${trip.cartName} · ${trip.statusText} `, display: 'ALWAYS', padding: 6, borderRadius: 8 }
        })),
        tripLines: trips.map(trip => ({
          points: [{ latitude: trip.latitude, longitude: trip.longitude }].concat(trip.stops.filter(stop => stop.status !== 'DONE').map(stop => ({ latitude: stop.latitude, longitude: stop.longitude }))),
          color: '#E07A3F', width: 5, arrowLine: true
        }))
      })
    } catch (error) { /* The next refresh retries; the rest of the console stays usable. */ }
  },
  // The courier's own cart: every leg from where the cart is to the next place, each with navigation.
  async loadMyRoute() {
    try {
      const route = await this.api('/admin/my-route')
      route.cartName = translate(route.cartName)
      route.statusText = translate(route.statusText)
      if (!route.assigned) return this.setData({ myRoute: { assigned: false, legs: [] }, isCourier: false })
      const legs = route.legs.map(leg => ({
        ...leg, fromName: translate(leg.fromName), toName: translate(leg.toName), toAddress: translate(leg.toAddress),
        details: (leg.details || []).map(translate), stateName: named(LEG_STATES, leg.state), etaText: dateTime(leg.arriveAt)
      }))
      const ahead = legs.filter(leg => leg.state !== 'DONE')
      const here = { latitude: route.latitude, longitude: route.longitude }
      const points = [here].concat(ahead.map(leg => ({ latitude: leg.toLatitude, longitude: leg.toLongitude })))
      // Each leg is drawn along its road path: the current one green, the ones after it orange.
      const lines = ahead.map(leg => ({
        points: (leg.path || [[leg.fromLatitude, leg.fromLongitude], [leg.toLatitude, leg.toLongitude]]).map(([latitude, longitude]) => ({ latitude, longitude })),
        color: leg.state === 'CURRENT' ? '#246B58' : '#E07A3F', width: leg.state === 'CURRENT' ? 7 : 5, arrowLine: true
      }))
      this.setData({
        isCourier: this.data.role !== 'ADMIN',
        myRoute: { ...route, legs },
        myRouteMarkers: [{
          id: 0, latitude: route.latitude, longitude: route.longitude, iconPath: '/images/marker-cart.png', width: 30, height: 30,
          callout: { content: ` ${route.cartName} `, display: 'ALWAYS', padding: 6, borderRadius: 8 }
        }].concat(ahead.map((leg, index) => ({
          id: index + 1, latitude: leg.toLatitude, longitude: leg.toLongitude, iconPath: '/images/marker-point.png', width: 26, height: 26,
          callout: { content: ` ${legs.indexOf(leg) + 1}. ${leg.toName} `, display: 'ALWAYS', padding: 5, borderRadius: 8 }
        }))),
        myRouteLines: lines,
        myRoutePoints: points
      })
    } catch (error) { /* The next refresh retries; the rest of the console stays usable. */ }
  },
  navigate(e) {
    const leg = this.data.myRoute.legs[Number(e.currentTarget.dataset.index)]
    if (!leg) return
    // Open the destination in WeChat Maps, where the user can hand off to the device navigator.
    leavingBriefly()
    wx.openLocation({ latitude: Number(leg.toLatitude), longitude: Number(leg.toLongitude), name: leg.toName, address: leg.toAddress, scale: 16 })
  },
  async transition(e) {
    const id = Number(e.currentTarget.dataset.id)
    const status = e.currentTarget.dataset.status
    const payload = { status, servicePointId: null, cartId: null }
    if (status === 'SCHEDULED') {
      const request = this.data.requests.find(item => Number(item.id) === id)
      const pickup = request && request.fulfillmentMethod === 'PICKUP'
      const options = pickup ? this.data.servicePoints : this.data.carts
      if (!options.length) return wx.showToast({ title: pickup ? L('暂无可用服务点', 'No service points available') : L('暂无可用补给车', 'No supply carts available'), icon: 'none' })
      const index = await new Promise(resolve => wx.showActionSheet({
        itemList: options.map(item => item.name),
        success: result => resolve(result.tapIndex), fail: () => resolve(-1)
      }))
      if (index < 0) return
      if (pickup) payload.servicePointId = options[index].id
      else payload.cartId = options[index].id
    }
    // Nothing is approved automatically; this confirmation is the explicit decision.
    if (status === 'APPROVED') {
      const request = this.data.requests.find(item => Number(item.id) === id)
      const stocked = request && request.inventoryItemId
      const confirmed = await new Promise(resolve => modal({
        title: L('批准需求', 'Approve request'),
        content: stocked
          ? L(`确认批准需求 #${id}？批准后会锁定离居民最近且有货的服务点的库存，并发放领取码。`,
            `Approve request #${id}? Stock is reserved at the nearest service point that has it and the resident gets a pickup code.`)
          : L(`确认批准需求 #${id}？该物资不在库存中，批准后请联系居民安排。`,
            `Approve request #${id}? This item isn't stocked, so please contact the resident to arrange it.`),
        success: result => resolve(result.confirm), fail: () => resolve(false)
      }))
      if (!confirmed) return
    }
    if (status === 'CANCELLED' || status === 'REJECTED') {
      const confirmed = await new Promise(resolve => modal({
        title: status === 'CANCELLED' ? L('取消需求', 'Cancel request') : L('拒绝需求', 'Decline request'),
        content: L(`确认${status === 'CANCELLED' ? '取消' : '拒绝'}需求 #${id}？居民会收到通知。`,
          `${status === 'CANCELLED' ? 'Cancel' : 'Decline'} request #${id}? The resident will be notified.`),
        success: result => resolve(result.confirm), fail: () => resolve(false)
      }))
      if (!confirmed) return
    }
    try {
      await this.api(`/admin/requests/${id}/status`, 'PATCH', payload)
      wx.showToast({ title: status === 'APPROVED' ? L('已批准', 'Approved') : L('状态已更新', 'Updated') }); await this.load()
    } catch (error) {
      // A refused approval explains why (e.g. not enough stock), which a toast would cut off.
      if (status === 'APPROVED') modal({ title: L('无法批准', "Can't approve"), content: translate(userMessage(error, L('批准失败', 'Approval failed'))), showCancel: false })
      else wx.showToast({ title: userMessage(error, L('更新失败', 'Update failed')), icon: 'none' })
    }
  },
  async adjust(e) {
    const id = Number(e.currentTarget.dataset.id)
    const delta = Number(e.currentTarget.dataset.delta)
    const item = this.data.inventory.find(row => row.id === id)
    if (!item) return
    try {
      await this.api(`/admin/inventory/${id}`, 'PATCH', { delta, version: item.version })
      await this.load()
    } catch (error) { wx.showToast({ title: userMessage(error, L('库存调整失败', 'Could not adjust stock')), icon: 'none' }) }
  },
  // Staff (at a service point or a courier) enter only the resident's code; the reply says what to hand over.
  async collect() {
    const pickupCode = this.data.pickupCode.trim()
    if (!/^\d{6}$/.test(pickupCode)) return wx.showToast({ title: L('请输入 6 位领取码', 'Please enter the 6-digit code'), icon: 'none' })
    try {
      const handover = await this.api('/admin/reservations/collect-by-code', 'POST', { pickupCode })
      this.setData({ pickupCode: '' })
      modal({
        title: L('核销成功，请交付', 'Verified. Please hand over'),
        content: L(`${handover.itemName} × ${handover.quantity}${handover.unit}
居民：${handover.residentName}（其第 ${handover.requestNumber} 个申请）
物资来自：${handover.servicePointName}
该需求已自动完成。`, `${term(handover.itemName)} × ${amount(handover.quantity, handover.unit)}
Resident: ${term(handover.residentName)} (their request no. ${handover.requestNumber})
From: ${translate(handover.servicePointName)}
The request has been completed automatically.`),
        showCancel: false
      })
      await this.load()
    } catch (error) {
      const message = /several reservations/i.test(error.message || '') ? L('领取码对应多个预约，请联系技术支持', 'This code matches several reservations. Please contact tech support.') : userMessage(error, L('核销失败', 'Verification failed'))
      wx.showToast({ title: message, icon: 'none' })
    }
  },
  // A courier may close a delivery without the resident's code; residents who got nothing appeal by phone.
  async markDelivered(e) {
    const id = Number(e.currentTarget.dataset.id)
    const confirmed = await new Promise(resolve => modal({
      title: L('标记已送达', 'Mark as delivered'),
      content: L(`未核验领取码，直接将需求 #${id} 标记为已送达并完成？居民如未收到可以申诉。`,
        `Mark request #${id} as delivered and complete without checking the pickup code? The resident can appeal if they didn't receive it.`),
      success: result => resolve(result.confirm), fail: () => resolve(false)
    }))
    if (!confirmed) return
    try {
      await this.api(`/admin/requests/${id}/mark-delivered`, 'POST')
      wx.showToast({ title: L('已标记送达', 'Marked delivered') }); await this.load(); await this.loadTrips()
    } catch (error) { wx.showToast({ title: userMessage(error, L('操作失败', 'Action failed')), icon: 'none' }) }
  }
})
