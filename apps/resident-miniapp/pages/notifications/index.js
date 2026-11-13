const { request } = require('../../utils/request')
const config = require('../../config')
const { dateTime, notificationName, userMessage } = require('../../utils/display')
const { shareToFriends } = require('../../utils/share')
const { L, pick, setTitle } = require('../../utils/i18n')
const { translate } = require('../../utils/translate')

// A mark for each kind of update, and where tapping it leads: pickup codes for a reservation,
// the request list for everything about a request.
const KINDS = {
  REQUEST_APPROVED: ['✓', 'ok'], REQUEST_SCHEDULED: ['✓', 'ok'], REQUEST_FULFILLED: ['✓', 'ok'],
  REQUEST_REJECTED: ['!', 'warn'], REQUEST_CANCELLED: ['!', 'warn'],
  RESERVATION_HELD: ['#', 'code'], PAYMENT_SUCCEEDED: ['#', 'code'], PAYMENT_REFUNDED: ['#', 'code'],
  ROUTE_READY: ['➜', 'ok']
}

const TEXT = {
  zh: {
    title: '服务通知', pullToRefresh: '下拉刷新', loading: '正在加载通知…', reload: '重新加载',
    reminders: '微信服务提醒', remindersHint: '离开小程序后也能收到关键进度', turnOn: '开启', request: '申请', empty: '暂无通知'
  },
  en: {
    title: 'Service Updates', pullToRefresh: 'Pull to refresh', loading: 'Loading updates…', reload: 'Reload',
    reminders: 'WeChat reminders', remindersHint: 'Get key updates even after leaving the WeChat application', turnOn: 'Turn on', request: 'Request', empty: 'No updates yet'
  }
}

Page({
  onShareAppMessage: shareToFriends,
  data: { t: TEXT.zh, rows: [], subscriptionAvailable: Boolean(config.subscribeTemplateId), loading: true, error: '' },
  onLoad() {
    this.setData({ t: pick(TEXT) })
    setTitle('服务通知', 'Service Updates')
    this.load()
  },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    this.setData({ loading: true, error: '' })
    try { const rows = await request({ url: '/resident/notifications' }); this.setData({ rows: rows.map(row => ({ ...row, payload: row.payload && { ...row.payload, itemName: translate(row.payload.itemName) }, title: notificationName(row.template), createdText: dateTime(row.createdAt), mark: (KINDS[row.template] || ['•'])[0], tone: (KINDS[row.template] || ['', ''])[1] })) }) }
    catch (error) { this.setData({ error: userMessage(error, L('通知加载失败', 'Could not load updates')) }) }
    finally { this.setData({ loading: false }) }
  },
  open(e) {
    const row = this.data.rows[Number(e.currentTarget.dataset.index)]
    if (!row) return
    if ((KINDS[row.template] || [])[1] === 'code') return wx.navigateTo({ url: '/pages/reservations/index' })
    wx.switchTab({ url: '/pages/requests/index' })
  },
  subscribe() {
    wx.requestSubscribeMessage({
      tmplIds: [config.subscribeTemplateId],
      success: result => wx.showToast({ title: result[config.subscribeTemplateId] === 'accept' ? L('已开启微信提醒', 'WeChat reminders are on') : L('未开启提醒', 'Reminders not turned on'), icon: 'none' }),
      fail: error => wx.showToast({ title: /cancel|deny/i.test(error.errMsg || '') ? L('已取消订阅', 'Subscription cancelled') : L('暂时无法开启微信提醒', "Can't turn on WeChat reminders right now"), icon: 'none' })
    })
  }
})
