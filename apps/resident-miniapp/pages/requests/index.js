const { request } = require('../../utils/request')
const config = require('../../config')
const { windowText } = require('../../utils/schedule')
const { categoryName, urgencyName, requestStatusName, fulfillmentName, dateTime, userMessage } = require('../../utils/display')
const { L, pick, setTitle, modal, leavingBriefly, applyTabBar } = require('../../utils/i18n')
const { translate } = require('../../utils/translate')
const stages = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SCHEDULED', 'FULFILLED']

const TEXT = {
  zh: {
    title: '处理进度', pullToRefresh: '下拉刷新', loading: '正在加载申请记录…', reload: '重新加载', request: '申请',
    quantity: '数量', noAddress: '未填写地址', reserve: '预约物资', codes: '查看领取码', track: '查看配送位置',
    feedback: '服务反馈', feedbackGiven: '已评价，谢谢', appealMissing: '没收到？申诉', appealQuestion: '有疑问？申诉',
    empty: '尚未提交需求', emptyHint: '前往“求助”填写第一项需求', cancelRequest: '取消申请'
  },
  en: {
    title: 'Request Status', pullToRefresh: 'Pull to refresh', loading: 'Loading your requests…', reload: 'Reload', request: 'Request',
    quantity: 'Qty', noAddress: 'No address given', reserve: 'Reserve supplies', codes: 'View pickup code', track: 'Track delivery',
    feedback: 'Give feedback', feedbackGiven: 'Rated, thank you', appealMissing: 'Not received? Appeal', appealQuestion: 'Questions? Appeal',
    empty: 'No requests yet', emptyHint: 'Go to "Get Help" to make your first request', cancelRequest: 'Cancel request'
  }
}
const { shareToFriends } = require('../../utils/share')

Page({
  onShareAppMessage: shareToFriends,
  data: { t: TEXT.zh, rows: [], loading: true, error: '', steps: [0, 1, 2, 3, 4], cancelling: 0 },
  onLoad() {
    // Opened first (a refreshed web page, a link from a notification), the tab labels must not stay
    // in the default Chinese; the home page is not the only way in.
    applyTabBar()
    this.setData({ t: pick(TEXT) })
    setTitle('我的申请', 'My Requests')
  },
  onShow() { this.load() },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()) },
  async load() {
    this.setData({ loading: true, error: '' })
    try {
      const rows = await request({ url: '/resident/requests?limit=100' })
      let given = []
      try { given = wx.getStorageSync('feedbackGiven') || [] } catch (error) { given = [] }
      this.setData({ rows: rows.map(row => ({
        ...row, itemDescription: translate(row.itemDescription), decisionNote: translate(row.decisionNote),
        approximateAddress: translate(row.approximateAddress), statusName: requestStatusName(row.status), categoryName: categoryName(row.category), urgencyName: urgencyName(row.urgency),
        createdText: dateTime(row.createdAt), stage: Math.max(0, stages.indexOf(row.status)),
        methodName: fulfillmentName(row.fulfillmentMethod),
        whenText: windowText(row.preferredStart, row.preferredEnd),
        assignedText: row.assignedServicePointName ? L(`领取地点：${row.assignedServicePointName}`, `Pickup at: ${translate(row.assignedServicePointName)}`)
          : row.assignedCartName ? L(`配送车辆：${row.assignedCartName}`, `Delivery cart: ${translate(row.assignedCartName)}`) : '',
        // Stocked-item requests are reserved automatically; only operator-approved ones need a manual reservation.
        automatic: row.inventoryItemId != null,
        feedbackGiven: given.indexOf(Number(row.id)) >= 0,
        trackable: row.fulfillmentMethod === 'DELIVERY' && !!row.assignedCartId && (row.status === 'SCHEDULED' || row.status === 'FULFILLED')
      })) })
    } catch (error) { this.setData({ error: userMessage(error, L('申请记录加载失败', 'Could not load your requests')) }) }
    finally { this.setData({ loading: false }) }
  },
  reserve(e) { wx.navigateTo({ url: `/pages/reservations/index?requestId=${e.currentTarget.dataset.id}` }) },
  feedback(e) { wx.navigateTo({ url: `/pages/feedback/index?requestId=${e.currentTarget.dataset.id}&number=${e.currentTarget.dataset.number}` }) },
  appeal(e) {
    const number = e.currentTarget.dataset.number
    modal({
      title: L('申诉', 'Appeal'),
      content: L(`对申请 #${number} 的处理结果有疑问（例如显示已送达但没收到）？将拨打服务热线 ${config.servicePhone}。`,
        `Have a question about how request #${number} was handled (for example, it shows as delivered but you didn't receive it)? We'll call the service hotline ${config.servicePhone}.`),
      confirmText: L('拨打', 'Call'), success: result => { if (result.confirm) { leavingBriefly(); wx.makePhoneCall({ phoneNumber: config.servicePhone }) } }
    })
  },
  // A request still waiting for review can be withdrawn; once staff have decided, only they can cancel it.
  cancelRequest(e) {
    const id = Number(e.currentTarget.dataset.id)
    const number = e.currentTarget.dataset.number
    if (this.data.cancelling) return
    modal({
      title: L('取消申请', 'Cancel request'),
      content: L(`确定取消申请 #${number}？取消后工作人员不会再处理它，如仍需要可以重新提交。`,
        `Cancel request #${number}? Staff will no longer handle it; you can submit a new one if you still need it.`),
      confirmText: L('取消申请', 'Cancel it'), cancelText: L('不取消', 'Keep it'),
      success: async result => {
        if (!result.confirm) return
        this.setData({ cancelling: id })
        try {
          await request({ url: `/resident/requests/${id}/cancel`, method: 'POST' })
          wx.showToast({ title: L('已取消', 'Cancelled'), icon: 'success' })
          await this.load()
        } catch (error) {
          modal({ title: L('无法取消', "Can't cancel"), content: userMessage(error, L('取消失败，请稍后重试', 'Could not cancel. Please try again later.')), showCancel: false })
          await this.load()
        } finally { this.setData({ cancelling: 0 }) }
      }
    })
  },
  codes() { wx.navigateTo({ url: '/pages/reservations/index' }) },
  // The map is a tab page, which cannot take a query string.
  track(e) { getApp().globalData.trackingRequestId = Number(e.currentTarget.dataset.id); wx.switchTab({ url: '/pages/map/index' }) }
})
