const { request } = require('../../utils/request')
const { userMessage } = require('../../utils/display')
const { readPlace, savePlace, ensureDefaultPlace, placeLabel } = require('../../utils/place')
const { shareToFriends } = require('../../utils/share')
const { L, lang, pick, setTitle, setLang, isRemembered, leavingBriefly, inLanguage } = require('../../utils/i18n')
const { lookupFor, replyText, englishNames, messageLanguage } = require('../../utils/assistant-text')

const TEXT = {
  zh: {
    welcome: '你好！小程序里的事都可以直接告诉我：查库存、查进度和领取码、找服务点，申请或取消物资、设置位置、评价服务、修改资料、切换语言、拨打热线……需要改动的事，我会先说明，你回复“确认”后才执行。',
    quick: ['现在有哪些物资？', '帮我申请两袋大米', '我的申请进度', '我的领取码', '最近的服务点几点开门？', '帮我设置我的位置'],
    safety: '智能助手使用实时业务数据；任何修改都要你在对话里回复“确认”才会执行。', toolsBefore: '已调用 ', toolsAfter: ' 项服务',
    working: '正在处理…', placeholder: '输入你的问题或要办的事…', send: '发送'
  },
  en: {
    welcome: 'Hi! Tell me anything you would do in the app: check stock, request status or pickup codes, find service points, request or cancel supplies, set your location, rate a service, update your profile, switch language, call the hotline… Before changing anything I tell you what I will do, and I only do it once you reply "yes".',
    quick: ['What supplies are available?', 'Request 2 bags of rice for me', 'My request status', 'My pickup codes', 'When does the nearest service point open?', 'Set my location'],
    safety: 'The assistant uses live service data. Nothing is changed until you reply "yes" in the chat.', toolsBefore: 'Used ', toolsAfter: ' services',
    working: 'Working on it…', placeholder: 'Ask a question or tell me what to do…', send: 'Send'
  }
}

// Tab pages open with switchTab; the others are pushed.
const TAB_PAGES = ['/pages/home/index', '/pages/map/index', '/pages/request-create/index', '/pages/requests/index', '/pages/profile/index']

// Summarize the number of services invoked using the active interface language.
function toolsText(count) { return L(`已调用 ${count} 项服务`, `Used ${count} service${count === 1 ? '' : 's'}`) }

Page({
  onShareAppMessage: shareToFriends,
  data: {
    t: TEXT.zh, conversationId: '', input: '', sending: false,
    messages: [{ role: 'assistant', content: TEXT.zh.welcome }],
    quick: TEXT.zh.quick
  },
  onLoad() {
    const t = pick(TEXT)
    // Reopened after the assistant switched the language: carry on with the same chat.
    const app = getApp()
    const kept = app && app.globalData.assistantChat
    if (kept) app.globalData.assistantChat = null
    this.setData({
      t, quick: t.quick,
      conversationId: kept ? kept.conversationId : '',
      messages: kept ? kept.messages : [{ role: 'assistant', content: t.welcome }]
    })
    setTitle('智能服务助手', 'Service Assistant')
  },
  bindInput(e) { this.setData({ input: e.detail.value }) },
  quickAsk(e) { this.setData({ input: e.currentTarget.dataset.text }, () => this.send()) },
  async send() {
    const message = this.data.input.trim()
    if (!message || this.data.sending) return
    this.setData({ messages: this.data.messages.concat({ role: 'user', content: message }), input: '', sending: true })
    await this.ask(message)
  },
  async ask(message) {
    // Asked in English, answered in English, whatever the interface shows (and the same for Chinese).
    const asked = messageLanguage(message) || lang()
    try {
      // Share the place the resident uses (their own, or the default the system gave them) so the
      // assistant can file requests and find the nearest point for them.
      await ensureDefaultPlace()
      const place = readPlace()
      const location = place.confirmed
        ? { latitude: place.latitude, longitude: place.longitude, placeLabel: placeLabel(place), placeIsDefault: !!place.isDefault }
        : {}
      // A model round-trip plus tool calls runs well past the 15s default.
      const result = await request({
        url: '/resident/assistant/chat', method: 'POST', timeout: 60000,
        data: { conversationId: this.data.conversationId || null, message, language: lang(), lookupMessage: lookupFor(message) || null, ...location }
      })
      const language = result.replyLanguage || asked
      // A model's own reply is already in the right language; replies written from live data come in Chinese.
      const content = inLanguage(language, () => result.aiProviderUsed ? englishNames(result.message) : replyText(result.message))
      const executions = result.toolExecutions || []
      const modelUsed = result.modelUsed === undefined ? result.aiProviderUsed : result.modelUsed
      this.setData({
        conversationId: result.conversationId,
        messages: this.data.messages.concat({
          role: 'assistant', content, tools: executions, toolsText: inLanguage(language, () => toolsText(executions.length)),
          providerText: inLanguage(language, () => modelUsed ? L('智能模型与实时业务数据', 'AI model with live service data') : L('实时业务查询模式', 'Live data lookup mode'))
        })
      })
      this.perform(result.clientActions || [])
    } catch (error) {
      this.setData({ messages: this.data.messages.concat({ role: 'assistant', content: inLanguage(asked, () => L(`暂时无法处理：${userMessage(error, '服务异常')}`, `Can't handle this right now: ${userMessage(error, 'Service error')}`)) }) })
    } finally {
      this.setData({ sending: false })
      setTimeout(() => wx.pageScrollTo({ scrollTop: 99999, duration: 200 }), 50)
    }
  },
  // What the resident asked the assistant to do on this phone, done at once.
  perform(actions) {
    actions.forEach(action => {
      const data = action.data || {}
      if (action.type === 'setPlace') {
        savePlace({ latitude: data.latitude, longitude: data.longitude, address: data.address })
      } else if (action.type === 'setLanguage') {
        setLang(data.language, isRemembered())
        const app = getApp()
        app.globalData.languageChosen = true
        // Every open page was drawn in the old language: start again on this page, keeping the chat.
        app.globalData.assistantChat = { conversationId: this.data.conversationId, messages: this.data.messages }
        setTimeout(() => wx.reLaunch({ url: '/pages/assistant/index' }), 600)
      } else if (action.type === 'feedbackGiven') {
        let given = []
        try { given = wx.getStorageSync('feedbackGiven') || [] } catch (error) { given = [] }
        const id = Number(data.requestId)
        if (given.indexOf(id) < 0) {
          try { wx.setStorageSync('feedbackGiven', given.concat(id).slice(-300)) } catch (error) { /* Only the label on the requests page. */ }
        }
      } else if (action.type === 'call') {
        leavingBriefly()
        wx.makePhoneCall({ phoneNumber: String(data.phone), fail() {} })
      } else if (action.type === 'openLocation') {
        leavingBriefly()
        wx.openLocation({ latitude: Number(data.latitude), longitude: Number(data.longitude), name: data.name, address: data.address, scale: 16, fail() {} })
      } else if (action.type === 'openPage') {
        this.open(data)
      }
    })
  },
  open(data) {
    if (data.page === 'track') {
      // The map is a tab page, which cannot take a query string.
      getApp().globalData.trackingRequestId = Number(data.requestId)
      return wx.switchTab({ url: '/pages/map/index' })
    }
    if (data.page === 'feedback') return wx.navigateTo({ url: `/pages/feedback/index?requestId=${data.requestId}&number=${data.requestNumber}` })
    if (TAB_PAGES.indexOf(data.path) >= 0) return wx.switchTab({ url: data.path })
    if (data.path) wx.navigateTo({ url: data.path })
  }
})
