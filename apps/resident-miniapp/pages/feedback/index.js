const { request } = require('../../utils/request')
const { userMessage } = require('../../utils/display')
const { shareToFriends } = require('../../utils/share')
const { L, pick, setTitle, modal } = require('../../utils/i18n')

// Requests this resident has already rated, so the status page can say so instead of offering
// a form the backend would refuse (one rating per request).
const GIVEN_KEY = 'feedbackGiven'
function rememberGiven(requestId) {
  try {
    const given = wx.getStorageSync(GIVEN_KEY) || []
    if (given.indexOf(requestId) < 0) wx.setStorageSync(GIVEN_KEY, given.concat(requestId).slice(-300))
  } catch (error) { /* Only a hint for the status page. */ }
}

const TEXT = {
  zh: {
    thanks: '感谢你的反馈', thanksHint: '这条记录将用于计算真实满意度和出行时间改善。', back: '返回申请进度',
    heading: '本次服务体验如何？', request: '申请', previous: '以前获取同类物资所需时间（分钟）', current: '本次实际所需时间（分钟）',
    comments: '补充意见', submit: '提交反馈'
  },
  en: {
    thanks: 'Thank you for your feedback', thanksHint: "It helps us measure real satisfaction and how much travel time we're saving.", back: 'Back to requests',
    heading: 'How was this service?', request: 'Request', previous: 'Time it used to take to get these supplies (minutes)', current: 'Time it took this time (minutes)',
    comments: 'Other comments', submit: 'Submit feedback'
  }
}

Page({
  onShareAppMessage: shareToFriends,
  data: { t: TEXT.zh, requestId: null, rating: 5, comments: '', previousTravelMinutes: '', currentTravelMinutes: '', submitted: false, submitting: false, stars: [1, 2, 3, 4, 5] },
  onLoad(options) {
    this.setData({ t: pick(TEXT), requestId: Number(options.requestId), requestNumber: Number(options.number) || '' })
    setTitle('服务反馈', 'Service Feedback')
  },
  rate(e) { this.setData({ rating: Number(e.currentTarget.dataset.value) }) },
  bindText(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  backToRequests() { wx.switchTab({ url: '/pages/requests/index' }) },
  async submit() {
    if (this.data.submitting) return
    if (!Number.isInteger(this.data.requestId) || this.data.requestId < 1) return wx.showToast({ title: L('申请编号无效', 'Invalid request number'), icon: 'none' })
    const previous = this.data.previousTravelMinutes === '' ? null : Number(this.data.previousTravelMinutes)
    const current = this.data.currentTravelMinutes === '' ? null : Number(this.data.currentTravelMinutes)
    if ((previous !== null && (!Number.isInteger(previous) || previous < 0)) || (current !== null && (!Number.isInteger(current) || current < 0))) {
      return wx.showToast({ title: L('出行时间应为非负整数', 'Travel time must be a whole number (0 or more)'), icon: 'none' })
    }
    this.setData({ submitting: true })
    try {
      await request({ url: '/resident/feedback', method: 'POST', data: {
        requestId: this.data.requestId, rating: this.data.rating, comments: this.data.comments || null,
        previousTravelMinutes: previous, currentTravelMinutes: current
      } })
      rememberGiven(this.data.requestId)
      this.setData({ submitted: true })
    } catch (error) {
      // Each request takes one rating; a second one conflicts with the first.
      if (error.statusCode === 409 && /existing record/i.test(error.message || '')) {
        rememberGiven(this.data.requestId)
        modal({ title: L('已经评价过了', 'Already rated'), content: L('你已经对这个申请提交过反馈，每个申请只能评价一次。谢谢！', "You've already given feedback on this request; each request can be rated once. Thank you!"), showCancel: false, success: () => this.backToRequests() })
      } else wx.showToast({ title: userMessage(error, L('提交失败', 'Submission failed')), icon: 'none' })
    }
    finally { this.setData({ submitting: false }) }
  }
})
