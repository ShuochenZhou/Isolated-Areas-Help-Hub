const { request, uuid } = require('../../utils/request')
const config = require('../../config')
const { reservationStatusName, paymentStatusName, dateTime, userMessage } = require('../../utils/display')
const { L, pick, setTitle, modal, leavingBriefly } = require('../../utils/i18n')
const { translate, term, amount } = require('../../utils/translate')

const TEXT = {
  zh: {
    request: '申请', paymentReceipt: '微信支付到账后生成领取码。', validUntil: '有效期至', releaseAfter: '，逾期自动释放库存。',
    loading: '正在加载领取码…', reload: '重新加载', paidHidden: '当前未开通微信商户收款，仅展示公益免费物资；不会模拟支付成功。',
    myCodes: '我的领取码', countSuffix: ' 条', from: '物资来自', pay: '微信支付', refund: '申请退款',
    codePrefix: '领取码 ', copyHint: '（点击复制）', empty: '暂无领取码。需求经工作人员批准后，领取码会出现在这里。',
    manualTitle: '为人工批准的需求预约', pendingSuffix: ' 条待预约', requestLabel: '对应申请', noApproved: '暂无已批准申请',
    itemLabel: '同类别物资', noStock: '该类别暂无可用免费库存', waitApproval: '请先等待需求批准', quantityLabel: '预约数量',
    generate: '生成领取码（保留 48 小时）'
  },
  en: {
    request: 'Request', paymentReceipt: 'Your pickup code is issued once the WeChat Pay payment arrives.', validUntil: 'Valid until', releaseAfter: '; after that the stock is released automatically.',
    loading: 'Loading pickup codes…', reload: 'Reload', paidHidden: 'WeChat Pay is not set up yet, so only free supplies are shown. Payments are never simulated.',
    myCodes: 'My Pickup Codes', countSuffix: '', from: 'From', pay: 'WeChat Pay', refund: 'Request refund',
    codePrefix: 'Pickup code ', copyHint: ' (tap to copy)', empty: 'No pickup codes yet. Once staff approve a request, its code appears here.',
    manualTitle: 'Reserve for staff-approved requests', pendingSuffix: ' to reserve', requestLabel: 'Request', noApproved: 'No approved requests',
    itemLabel: 'Supplies in this category', noStock: 'No free stock in this category right now', waitApproval: 'Please wait for your request to be approved', quantityLabel: 'Quantity',
    generate: 'Get pickup code (held for 48 hours)'
  }
}

// Same category as the approved need; a pickup already scheduled at a service point can
// only be collected there, so only that point's stock is offered.
function inventoryForRequest(requests, allInventory, requestIndex) {
  const selected = requests[requestIndex]
  if (!selected) return []
  return allInventory.filter(item => item.category === selected.category && !(
    selected.fulfillmentMethod === 'PICKUP' && selected.assignedServicePointId &&
    Number(item.servicePointId) !== Number(selected.assignedServicePointId)))
}

function handoverText(method, pointName) {
  return method === 'PICKUP'
    ? L(`请在营业时间内到${pointName || '服务点'}出示领取码。`, `Show your pickup code at ${translate(pointName) || 'the service point'} during opening hours.`)
    : L('补给车送达时，请向工作人员出示领取码。', 'When the supply cart arrives, show your pickup code to the staff.')
}
const { shareToFriends } = require('../../utils/share')

// A reservation as shown: names in the current language, status, expiry and amount.
function decorateReservation(item) {
  return {
    ...item, itemName: term(item.itemName), servicePointName: translate(item.servicePointName),
    servicePointAddress: translate(item.servicePointAddress),
    statusName: reservationStatusName(item.status), expiresText: dateTime(item.expiresAt),
    amountText: item.amountFen
      ? L(`应付 ¥${(item.amountFen / 100).toFixed(2)} · ${paymentStatusName(item.paymentStatus)}`, `Due ¥${(item.amountFen / 100).toFixed(2)} · ${paymentStatusName(item.paymentStatus)}`)
      : L('公益免费', 'Free')
  }
}

Page({
  onShareAppMessage: shareToFriends,
  data: {
    t: TEXT.zh, requests: [], allInventory: [], inventory: [], reservations: [], requestIndex: 0, itemIndex: 0, quantity: 1,
    receipt: null, presetRequestId: null, paying: false, reserving: false, loading: true, error: '',
    paymentsEnabled: Boolean(config.paymentsEnabled), paidItemsHidden: 0
  },
  onLoad(options) {
    this.setData({ t: pick(TEXT), presetRequestId: options.requestId ? Number(options.requestId) : null })
    setTitle('我的领取码', 'My Pickup Codes')
    this.load()
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const [allRequests, inventory, reservations] = await Promise.all([
        request({ url: '/resident/requests?limit=100' }), request({ url: '/resident/inventory' }), request({ url: '/resident/reservations' })
      ])
      const methods = {}
      allRequests.forEach(item => { methods[item.id] = item.fulfillmentMethod })
      this.methods = methods
      // Requests for stocked items were reserved automatically; only operator-approved ones
      // without a live reservation still need one here.
      const reserved = {}
      reservations.filter(item => item.status === 'HELD' || item.status === 'CONFIRMED' || item.status === 'COLLECTED')
        .forEach(item => { reserved[item.requestId] = true })
      const requests = allRequests.filter(item => (item.status === 'APPROVED' || item.status === 'SCHEDULED')
        && item.inventoryItemId == null && !reserved[item.id]).map(item => ({
        ...item, label: L(`#${item.residentNumber} ${item.itemDescription}（${item.fulfillmentMethod === 'PICKUP' ? '自取' : '配送'}）`,
          `#${item.residentNumber} ${translate(item.itemDescription)} (${item.fulfillmentMethod === 'PICKUP' ? 'pickup' : 'delivery'})`)
      }))
      const inStock = inventory.filter(item => item.freeQuantity > 0)
      const available = inStock.filter(item => config.paymentsEnabled || item.unitPriceFen === 0).map(item => ({
        ...item, priceText: item.unitPriceFen ? `¥${(item.unitPriceFen / 100).toFixed(2)}` : L('公益免费', 'Free'),
        label: L(`${item.name} · ${item.servicePointName}（可用 ${item.freeQuantity}${item.unit}，${item.unitPriceFen ? `¥${(item.unitPriceFen / 100).toFixed(2)}` : '公益免费'}）`,
          `${term(item.name)} · ${translate(item.servicePointName)} (${amount(item.freeQuantity, item.unit)} available, ${item.unitPriceFen ? `¥${(item.unitPriceFen / 100).toFixed(2)}` : 'free'})`)
      }))
      const decoratedReservations = reservations.map(item => ({
        ...decorateReservation(item),
        active: item.status === 'HELD' || item.status === 'CONFIRMED',
        handover: handoverText(methods[item.requestId], item.servicePointName)
      }))
      const preset = requests.findIndex(item => item.id === this.data.presetRequestId)
      const requestIndex = preset >= 0 ? preset : 0
      this.setData({
        requests, allInventory: available, inventory: inventoryForRequest(requests, available, requestIndex),
        reservations: decoratedReservations, requestIndex, itemIndex: 0,
        paidItemsHidden: config.paymentsEnabled ? 0 : inStock.filter(item => item.unitPriceFen > 0).length
      })
    } catch (error) { this.setData({ error: userMessage(error, L('预约信息加载失败', 'Could not load your reservations')) }) }
    finally { this.setData({ loading: false }) }
  },
  requestChange(e) {
    const requestIndex = Number(e.detail.value)
    this.setData({ requestIndex, inventory: inventoryForRequest(this.data.requests, this.data.allInventory, requestIndex), itemIndex: 0 })
  },
  itemChange(e) { this.setData({ itemIndex: Number(e.detail.value) }) },
  quantityChange(e) { this.setData({ quantity: e.detail.value }) },
  async reserve() {
    if (this.data.reserving || this.data.paying) return
    const supplyRequest = this.data.requests[this.data.requestIndex]
    const item = this.data.inventory[this.data.itemIndex]
    if (!supplyRequest || !item) return wx.showToast({ title: L('暂无可预约的申请或库存', 'Nothing to reserve right now'), icon: 'none' })
    const quantity = Number(this.data.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return wx.showToast({ title: L('数量应为 1–100 的整数', 'Quantity must be a whole number from 1 to 100'), icon: 'none' })
    if (quantity > item.freeQuantity) return wx.showToast({ title: L(`当前最多可预约 ${item.freeQuantity} ${item.unit}`, `You can reserve at most ${amount(item.freeQuantity, item.unit)} right now`), icon: 'none' })
    this.setData({ reserving: true })
    try {
      const receipt = await request({ url: '/resident/reservations', method: 'POST', idempotent: true, idempotencyKey: uuid(), data: { requestId: supplyRequest.id, inventoryItemId: item.id, quantity } })
      this.setData({ receipt: { ...receipt, itemName: term(receipt.itemName), requestNumber: supplyRequest.residentNumber, expiresText: dateTime(receipt.expiresAt), handover: handoverText(supplyRequest.fulfillmentMethod, item.servicePointName) } })
      if (receipt.paymentRequired) await this.payReservation(receipt.reservationId)
      await this.load()
    } catch (error) { wx.showToast({ title: userMessage(error, L('预约失败', 'Reservation failed')), icon: 'none' }) }
    finally { this.setData({ reserving: false }) }
  },
  async payExisting(e) {
    if (!this.data.paymentsEnabled) return wx.showToast({ title: L('收费服务尚未开放', 'Paid supplies are not available yet'), icon: 'none' })
    await this.payReservation(Number(e.currentTarget.dataset.id)); await this.load()
  },
  async payReservation(reservationId) {
    if (this.data.paying) return
    if (!this.data.paymentsEnabled) return wx.showToast({ title: L('收费服务尚未开放', 'Paid supplies are not available yet'), icon: 'none' })
    this.setData({ paying: true })
    try {
      const payment = await request({ url: '/resident/payments', method: 'POST', data: { reservationId } })
      const p = payment.requestPayment
      if (!p) return
      leavingBriefly()
      await new Promise((resolve, reject) => wx.requestPayment({
        timeStamp: p.timeStamp, nonceStr: p.nonceStr, package: p.packageValue,
        signType: p.signType, paySign: p.paySign, success: resolve, fail: reject
      }))
      wx.showToast({ title: L('支付成功，正在确认', 'Paid, confirming'), icon: 'success' })
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        const reservations = await request({ url: '/resident/reservations' })
        const confirmed = reservations.find(item => item.reservationId === reservationId && item.status === 'CONFIRMED')
        if (confirmed) { this.setData({ reservations: reservations.map(decorateReservation), receipt: decorateReservation(confirmed) }); return }
      }
      wx.showToast({ title: L('到账确认稍有延迟，请稍后刷新', 'Payment confirmation is delayed. Please refresh shortly.'), icon: 'none' })
    } catch (error) {
      wx.showToast({ title: error.errMsg && error.errMsg.includes('cancel') ? L('已取消支付', 'Payment cancelled') : userMessage(error, L('支付失败', 'Payment failed')), icon: 'none' })
    } finally { this.setData({ paying: false }) }
  },
  async refund(e) {
    const paymentId = Number(e.currentTarget.dataset.id)
    const confirmed = await new Promise(resolve => modal({ title: L('申请退款', 'Request refund'), content: L('退款成功后预约将取消并释放库存。', 'Once refunded, the reservation is cancelled and the stock is released.'), success: result => resolve(result.confirm) }))
    if (!confirmed) return
    try { await request({ url: `/resident/payments/${paymentId}/refund`, method: 'POST', data: { reason: '居民取消未领取预约' } }); wx.showToast({ title: L('退款处理中', 'Refunding') }); await this.load() }
    catch (error) { wx.showToast({ title: userMessage(error, L('退款失败', 'Refund failed')), icon: 'none' }) }
  },
  copyCode(e) { const code = e.currentTarget.dataset.code || (this.data.receipt && this.data.receipt.pickupCode); if (code) wx.setClipboardData({ data: code }) }
})
