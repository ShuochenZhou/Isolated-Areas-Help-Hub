const { request } = require('../../utils/request')
const config = require('../../config')
const { userMessage } = require('../../utils/display')
const { shareToFriends } = require('../../utils/share')
const { L, pick, setTitle, leavingBriefly, applyTabBar } = require('../../utils/i18n')
const { term } = require('../../utils/translate')

const TEXT = {
  zh: {
    loading: '正在加载居民资料…', defaultName: '社区居民', residentNo: '居民编号', household: '家庭', people: '人', tapToEdit: '点击编辑',
    assistant: '智能服务助手', assistantHint: '查库存、查进度、找服务点', codesIcon: '票', codes: '我的领取码', codesHint: '领取码、领取地点与有效期',
    noticesIcon: '信', notices: '进度通知', noticesHint: '申请、预约和路线更新', hotline: '社区服务热线', hotlineHint: '点击拨打服务电话',
    operatorIcon: '管', operator: '公益运营入口', operatorHint: '仅限授权人员审核与核销',
    privacy: '隐私与安全', privacyText: '位置仅用于服务调度；AI 不会自动提交需求或预约，任何修改操作均需你明确确认。',
    relogin: '重新登录', editTitle: '居民资料', nameLabel: '称呼', householdLabel: '共同生活家庭人数',
    householdHint: '家庭人数只用于统计实际受益人数，不向其他居民公开。', save: '保存', cancel: '取消'
  },
  en: {
    loading: 'Loading your profile…', defaultName: 'Resident', residentNo: 'Resident No.', household: 'Household of', people: '', tapToEdit: 'Tap to edit',
    assistant: 'Service Assistant', assistantHint: 'Check stock, request status and service points', codesIcon: 'Tix', codes: 'My Pickup Codes', codesHint: 'Codes, pickup places and expiry',
    noticesIcon: 'Msg', notices: 'Status Updates', noticesHint: 'Request, reservation and route updates', hotline: 'Community Hotline', hotlineHint: 'Tap to call the service line',
    operatorIcon: 'Ops', operator: 'Operations Portal', operatorHint: 'Authorised staff only: review and verify',
    privacy: 'Privacy & Security', privacyText: 'Your location is only used to schedule service. The AI never submits requests or reservations on its own; every change needs your explicit confirmation.',
    relogin: 'Sign in again', editTitle: 'Resident Profile', nameLabel: 'Name', householdLabel: 'People in your household',
    householdHint: 'Household size is only used to count how many people are helped, and is never shown to other residents.', save: 'Save', cancel: 'Cancel'
  }
}

Page({
  onShareAppMessage: shareToFriends,
  data: { t: TEXT.zh, user: {}, editing: false, editName: '', householdSize: 1, loading: true, error: '', saving: false, loggingIn: false, servicePhoneAvailable: Boolean(config.servicePhone) },
  onLoad() {
    // Opened first (a refreshed web page, a link from a notification), the tab labels must not stay
    // in the default Chinese; the home page is not the only way in.
    applyTabBar()
    this.setData({ t: pick(TEXT) })
    setTitle('我的', 'Me')
  },
  async onShow() {
    const cached = getApp().globalData.user || wx.getStorageSync('currentUser') || {}
    this.setData({ user: this.decorate(cached) })
    this.setData({ loading: true, error: '' })
    try {
      const profile = await request({ url: '/resident/profile' })
      this.sourceName = profile.displayName
      this.setData({ user: this.decorate(profile), editName: term(profile.displayName), householdSize: profile.householdSize })
    } catch (error) { this.setData({ error: userMessage(error, L('资料加载失败，当前显示本地缓存', 'Could not load your profile; showing the saved copy')) }) }
    finally { this.setData({ loading: false }) }
  },
  // Localize only the system-assigned default name; preserve names chosen by residents.
  decorate(user) {
    const displayName = user.displayName ? term(user.displayName) : ''
    return { ...user, displayName, avatarText: displayName ? displayName.slice(0, 1) : L('邻', 'H') }
  },
  go(e) { wx.navigateTo({ url: e.currentTarget.dataset.url }) },
  call() {
    if (!config.servicePhone) return wx.showToast({ title: L('服务热线尚未配置', 'The service hotline is not set up yet'), icon: 'none' })
    leavingBriefly()
    wx.makePhoneCall({ phoneNumber: config.servicePhone })
  },
  edit(e) { this.setData({ editing: e && e.currentTarget.dataset.editing === 'false' ? false : true }) },
  bindEdit(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  async saveProfile() {
    if (this.data.saving) return
    const typed = this.data.editName.trim()
    // Persist the canonical default name rather than its localized display value.
    const displayName = this.sourceName && typed === term(this.sourceName) ? this.sourceName : typed
    const householdSize = Number(this.data.householdSize)
    if (!displayName || displayName.length > 100) return wx.showToast({ title: L('称呼应为 1–100 个字符', 'Name must be 1–100 characters'), icon: 'none' })
    if (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 20) return wx.showToast({ title: L('家庭人数应为 1–20 的整数', 'Household size must be a whole number from 1 to 20'), icon: 'none' })
    this.setData({ saving: true })
    try {
      const profile = await request({ url: '/resident/profile', method: 'PATCH', data: { displayName, householdSize } })
      getApp().globalData.user = { ...getApp().globalData.user, ...profile }
      wx.setStorageSync('currentUser', getApp().globalData.user)
      this.setData({ user: this.decorate(profile), editing: false })
      wx.showToast({ title: L('资料已保存', 'Saved') })
    } catch (error) { wx.showToast({ title: userMessage(error, L('保存失败', 'Could not save')), icon: 'none' }) }
    finally { this.setData({ saving: false }) }
  },
  async logout() {
    if (this.data.loggingIn) return
    this.setData({ loggingIn: true })
    wx.removeStorageSync('accessToken'); wx.removeStorageSync('currentUser'); getApp().globalData.token = ''
    try { await getApp().ensureLogin(true); wx.showToast({ title: L('已重新登录', 'Signed in') }); await this.onShow() }
    catch (error) { wx.showToast({ title: userMessage(error, L('重新登录失败', 'Could not sign in again')), icon: 'none' }) }
    finally { this.setData({ loggingIn: false }) }
  }
})
