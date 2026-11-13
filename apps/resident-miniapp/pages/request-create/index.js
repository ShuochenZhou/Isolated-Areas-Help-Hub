const { request, uuid } = require('../../utils/request')
const { readPlace, ensureDefaultPlace, placeLabel, coordinateText, withinBounds } = require('../../utils/place')
const { userMessage, categoryName, urgencyName } = require('../../utils/display')
const { productsFrom, letterGroups, shortPointName } = require('../../utils/products')
const { SLOTS, bookingDays, sameDayIndex, windowFor, slotOver, slotLabel } = require('../../utils/schedule')
const { openingHours } = require('../../utils/display')
const config = require('../../config')
const { L, pick, setTitle, modal, applyTabBar } = require('../../utils/i18n')
const { translate, amount } = require('../../utils/translate')
const { shareToFriends } = require('../../utils/share')

const CATEGORIES = ['FOOD', 'WATER', 'HYGIENE', 'MEDICAL', 'EMERGENCY', 'OTHER']
const URGENCIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']

const TEXT = {
  zh: {
    heading: '告诉我们，你需要什么', intro: '位置只用于安排附近服务点或移动补给车，不对其他居民公开。',
    product: '需要的物资 *', loadingStock: '正在加载库存…', pointStock: '各服务点库存：',
    productHelp: '提交后由工作人员审核；批准后会从离你最近且有货的服务点发放领取码。',
    otherHelp: '库存中没有的物资会转人工处理，工作人员会尽快跟进。',
    category: '物资类别', notes: '补充说明（可选）', need: '具体需要 *',
    notesPlaceholder: '例如：家中有老人，尽量上午送达', needPlaceholder: '例如：婴儿纸尿裤 M 码',
    quantity: '数量 *', urgency: '紧急程度', method: '领取方式 *',
    pickup: '到点自取', pickupCopy: '营业时间内到服务点出示领取码',
    delivery: '补给车配送', deliveryCopy: '补给车按路线送到附近，送达时出示领取码',
    deliveryTime: '送达时间', pickupTime: '领取时间',
    asapDelivery: '审批后立即派最近的补给车。', asapPickup: '审批后即可在营业时间内领取。',
    slotDelivery: '补给车会在所选时段内送达，不会提前。', slotPickup: '实际领取时间以服务点营业时间为准，最多可提前 7 天预约。',
    deliveryPlace: '配送位置 *', yourPlace: '你的位置 *', pickPlace: '点击填写详细地址', noPlace: '尚未选择位置',
    placeHelp: '填写详细地址即可定位到地图上，无需开启手机定位。',
    accessibility: '无障碍或联系说明', accessibilityPlaceholder: '例如：行动不便，请提前电话联系',
    submit: '确认提交',
    emergency: '如遇人身危险或紧急医疗情况，请立即联系 110、120 或当地应急服务。',
    sheetTitle: '选择物资', close: '关闭', searchPlaceholder: '搜索名称，如：大米、口罩', none: '暂无',
    notFoundBefore: '没有找到“', notFoundAfter: '”，可选下方“其他”提交'
  },
  en: {
    heading: 'Tell us what you need', intro: 'Your location is only used to arrange a nearby service point or supply cart, and is never shown to other residents.',
    product: 'Supplies needed *', loadingStock: 'Loading stock…', pointStock: 'Stock by service point: ',
    productHelp: "Our staff review every request. Once approved, you get a pickup code from the nearest service point that has the item.",
    otherHelp: "Items we don't stock are handled by staff, who will follow up as soon as they can.",
    category: 'Category', notes: 'Additional notes (optional)', need: 'What you need *',
    notesPlaceholder: 'e.g. Elderly at home, mornings please', needPlaceholder: 'e.g. Baby diapers, size M',
    quantity: 'Quantity *', urgency: 'Urgency', method: 'How to receive *',
    pickup: 'Pickup', pickupCopy: 'Show your pickup code at the service point during opening hours',
    delivery: 'Cart delivery', deliveryCopy: 'A supply cart brings it nearby on its route; show your code when it arrives',
    deliveryTime: 'Delivery time', pickupTime: 'Pickup time',
    asapDelivery: 'The nearest supply cart is sent right after approval.', asapPickup: 'Collect it during opening hours once approved.',
    slotDelivery: 'The supply cart arrives within the chosen slot, never earlier.', slotPickup: "Pickup follows the service point's opening hours. You can book up to 7 days ahead.",
    deliveryPlace: 'Delivery location *', yourPlace: 'Your location *', pickPlace: 'Tap to enter your address', noPlace: 'No location chosen yet',
    placeHelp: "Enter your address and we'll find it on the map; your phone's location service is not needed.",
    accessibility: 'Accessibility or contact notes', accessibilityPlaceholder: 'e.g. I have limited mobility, please call ahead',
    submit: 'Submit',
    emergency: 'If you are in danger or need urgent medical help, call 110 or 120, or contact local emergency services right away.',
    sheetTitle: 'Choose Supplies', close: 'Close', searchPlaceholder: 'Search by name, e.g. rice, masks', none: 'None',
    notFoundBefore: 'Nothing matches "', notFoundAfter: '". You can choose "Other" below.'
  }
}

function otherLabel() { return L('其他（库存中没有的物资，转人工处理）', "Other (items we don't stock; handled by staff)") }

Page({
  onShareAppMessage: shareToFriends,
  data: {
    t: TEXT.zh,
    products: [], productLabels: [], productIndex: 0, loadingProducts: true,
    sheetOpen: false, groups: [], visibleGroups: [], search: '', scrollTarget: '', otherLabel: '',
    days: [], dayIndex: 0, slots: SLOTS, slotLabels: [], slotIndex: 0,
    pickupHoursText: '',
    categories: CATEGORIES, categoryNames: [], categoryIndex: 0,
    methods: ['PICKUP', 'DELIVERY'], methodIndex: 0,
    urgencies: URGENCIES, urgencyNames: [], urgencyIndex: 1,
    itemDescription: '', quantity: '1', approximateAddress: '', accessibilityNotes: '', latitude: null, longitude: null,
    placeLabel: '', coordinates: '', submitting: false
  },

  onLoad() {
    // Opened first (a refreshed web page, a link from a notification), the tab labels must not stay
    // in the default Chinese; the home page is not the only way in.
    applyTabBar()
    const other = otherLabel()
    this.setData({
      t: pick(TEXT), otherLabel: other, productLabels: [other], days: bookingDays(),
      slotLabels: SLOTS.map(slotLabel), categoryNames: CATEGORIES.map(categoryName), urgencyNames: URGENCIES.map(urgencyName)
    })
    setTitle('提交物资需求', 'Request Supplies')
  },

  // Runs on first render and again on return from the picker, so a freshly chosen
  // place lands in the form without the page having to be rebuilt.
  // Stock changes all the time, so it is re-read whenever the tab is shown.
  onShow() {
    this.syncPlace()
    // A resident who never picked a place submits from their own default location.
    ensureDefaultPlace().then(() => this.syncPlace())
    this.loadProducts()
    this.loadPickupHours()
    // Date-relative labels change over time, so rebuild them whenever the tab appears while
    // preserving the selected date when its position shifts at midnight or after the final slot.
    const days = bookingDays()
    const dayIndex = sameDayIndex(days, this.data.days[this.data.dayIndex])
    const day = days[dayIndex]
    const slotIndex = !day.asap && slotOver(day, this.data.slots[this.data.slotIndex]) ? this.data.slots.length - 1 : this.data.slotIndex
    this.setData({ days, dayIndex, slotIndex })
  },
  // Both service points' hours are shown on the pickup option, since the nearest point with stock is chosen later.
  async loadPickupHours() {
    try {
      const place = readPlace()
      const points = await request({ url: `/resident/service-points?latitude=${place.latitude}&longitude=${place.longitude}&radiusMeters=50000` })
      this.setData({ pickupHoursText: points.map(point => `${shortPointName(point.name)} ${openingHours(point)}`).join(' · ') })
    } catch (error) { /* The option still works without the hours line. */ }
  },
  dayChange(e) {
    const dayIndex = Number(e.detail.value)
    const day = this.data.days[dayIndex]
    // Jump past a slot that is already over today.
    const slotIndex = !day.asap && slotOver(day, this.data.slots[this.data.slotIndex]) ? this.data.slots.length - 1 : this.data.slotIndex
    this.setData({ dayIndex, slotIndex })
  },
  slotChange(e) { this.setData({ slotIndex: Number(e.detail.value) }) },
  // A product tapped on the home page arrives through globalData (tab pages take no query).
  applyPreselection() {
    const app = getApp()
    const key = app.globalData.preselectProduct
    if (!key || !this.data.products.length) return
    app.globalData.preselectProduct = null
    const index = this.data.products.findIndex(product => product.key === key)
    if (index >= 0) this.setData({ productIndex: index, quantity: '1' })
  },
  async loadProducts(quiet = false) {
    this.setData({ loadingProducts: !this.data.products.length })
    try {
      const products = productsFrom(await request({ url: '/resident/inventory' }), config.paymentsEnabled)
        .map(product => ({ ...product, totalText: amount(product.totalFree, product.unit) }))
      const previous = this.selectedProduct()
      const kept = previous ? products.findIndex(product => product.key === previous.key) : -1
      // "Other" is the index just past the last product, so it has to be carried over explicitly
      // when the list is re-read (e.g. on returning from the place picker). It also counts as
      // chosen when the list was empty and the resident already typed what they need.
      const otherChosen = !previous && (this.data.products.length > 0 || Boolean(this.data.itemDescription.trim()))
      const groups = letterGroups(products)
      this.setData({
        products, productLabels: products.map(item => item.label).concat(otherLabel()),
        productIndex: otherChosen ? products.length : kept >= 0 ? kept : 0,
        groups, visibleGroups: this.filterGroups(groups, this.data.search)
      })
      // Never swap the chosen supply for another one without saying so.
      if (previous && kept < 0 && !quiet) {
        modal({
          title: L('物资已领完', 'No longer in stock'), showCancel: false,
          content: L(`你选择的“${previous.name}”刚刚已被领完，请重新选择需要的物资，或选“其他”提交转人工处理。`,
            `"${previous.name}" you chose has just run out. Please choose your supplies again, or choose "Other" to have staff handle it.`)
        })
      }
      this.applyPreselection()
    } catch (error) {
      wx.showToast({ title: userMessage(error, L('物资列表加载失败，可选“其他”提交', 'Could not load supplies. You can still choose "Other".')), icon: 'none' })
    } finally { this.setData({ loadingProducts: false }) }
  },
  selectedProduct() { return this.data.products[this.data.productIndex] || null },
  syncPlace() {
    const place = readPlace()
    if (!place.confirmed) {
      return this.setData({ latitude: null, longitude: null, placeLabel: '', coordinates: '', approximateAddress: '' })
    }
    this.setData({
      latitude: place.latitude, longitude: place.longitude,
      approximateAddress: place.address || '',
      placeLabel: placeLabel(place), coordinates: coordinateText(place)
    })
  },
  pickLocation() { wx.navigateTo({ url: '/pages/place/index' }) },
  bindText(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  productChange(e) { this.setData({ productIndex: Number(e.detail.value), quantity: '1' }) },
  // Letter-indexed product sheet: residents jump by initial (pinyin, or English in English) or type part of a name.
  openSheet() { this.setData({ sheetOpen: true, search: '', visibleGroups: this.data.groups, scrollTarget: '' }) },
  closeSheet() { this.setData({ sheetOpen: false }) },
  pickProduct(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ productIndex: index >= 0 ? index : this.data.products.length, quantity: '1', sheetOpen: false })
  },
  jumpTo(e) { this.setData({ scrollTarget: `letter-${e.currentTarget.dataset.letter === '#' ? 'other' : e.currentTarget.dataset.letter}` }) },
  searchInput(e) {
    const search = e.detail.value
    this.setData({ search, visibleGroups: this.filterGroups(this.data.groups, search), scrollTarget: '' })
  },
  filterGroups(groups, search) {
    const text = String(search || '').trim().toLowerCase()
    if (!text) return groups
    // Shown names may be English; the original Chinese name still matches.
    const matches = item => [item.name, item.sourceName, item.categoryName].some(name => String(name || '').toLowerCase().indexOf(text) >= 0)
    return groups.map(group => ({ ...group, items: group.items.filter(matches) }))
      .filter(group => group.items.length)
  },
  noop() {},
  categoryChange(e) { this.setData({ categoryIndex: Number(e.detail.value) }) },
  urgencyChange(e) { this.setData({ urgencyIndex: Number(e.detail.value) }) },
  methodChange(e) { this.setData({ methodIndex: Number(e.currentTarget.dataset.index) }) },
  // Keep what the resident types (even an empty box while they retype); it is validated on submit.
  quantityChange(e) { this.setData({ quantity: String(e.detail.value).replace(/\D/g, '') }) },
  async submit() {
    if (this.data.submitting) return
    const product = this.selectedProduct()
    const note = this.data.itemDescription.trim()
    if (!product && !note) return wx.showToast({ title: L('请填写需要的物资', 'Please say what you need'), icon: 'none' })
    if (this.data.latitude == null) return wx.showToast({ title: L('请先设置位置', 'Please set your location first'), icon: 'none' })
    if (!withinBounds(this.data.latitude, this.data.longitude)) {
      return wx.showToast({ title: L('所选位置超出服务范围，请重新选点', 'This location is outside the service area. Please pick again.'), icon: 'none' })
    }
    const quantity = Number(this.data.quantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return wx.showToast({ title: L('请填写 1–100 之间的数量', 'Please enter a quantity from 1 to 100'), icon: 'none' })
    if (product && quantity > product.maxFree) {
      return modal({
        title: L('库存不足', 'Not enough stock'), showCancel: false,
        content: product.maxFree > 0
          ? L(`${product.name} 单个服务点目前最多可领 ${product.maxFree}${product.unit}（${product.pointsText}）。请减少数量，或分成多次申请。`,
            `Any one service point has at most ${amount(product.maxFree, product.unit)} of ${product.name} right now (${product.pointsText}). Lower the quantity or split it into several requests.`)
          : L(`${product.name} 目前没有库存，可选择其他物资，或选“其他”提交转人工处理。`,
            `${product.name} is out of stock. Choose other supplies, or choose "Other" to have staff handle it.`)
      })
    }
    const day = this.data.days[this.data.dayIndex]
    const slot = this.data.slots[this.data.slotIndex]
    if (slotOver(day, slot)) return wx.showToast({ title: L('这个时段已经过去，请换一个时段', 'That time slot is over. Please choose another.'), icon: 'none' })
    const booking = windowFor(day, slot)
    this.setData({ submitting: true })
    try {
      const created = await request({
        url: '/resident/requests', method: 'POST', idempotent: true, idempotencyKey: uuid(),
        data: {
          category: product ? product.category : this.data.categories[this.data.categoryIndex],
          inventoryItemId: product ? product.itemId : null,
          // The request carries the backend's own (Chinese) item name, which staff read.
          itemDescription: product ? (note ? `${product.sourceName}：${note}` : product.sourceName) : note,
          quantity, urgency: this.data.urgencies[this.data.urgencyIndex],
          fulfillmentMethod: this.data.methods[this.data.methodIndex],
          preferredStart: booking.preferredStart, preferredEnd: booking.preferredEnd,
          latitude: this.data.latitude, longitude: this.data.longitude,
          approximateAddress: this.data.approximateAddress || null, accessibilityNotes: this.data.accessibilityNotes || null
        }
      })
      // Clear the form so returning to this tab cannot resubmit the same need by accident.
      this.setData({ itemDescription: '', quantity: '1', accessibilityNotes: '', urgencyIndex: 1 })
      this.loadProducts(true)
      const title = created.status === 'REJECTED' ? L('暂时无法满足', 'Unable to fulfil for now')
        : created.status === 'SUBMITTED' ? L('已提交，等待审核', 'Submitted for review') : L('已批准', 'Approved')
      modal({
        title, showCancel: false,
        content: L(`你的第 ${created.residentNumber} 个申请。${created.decisionNote || ''}`,
          `This is your request #${created.residentNumber}. ${translate(created.decisionNote) || ''}`),
        success: () => wx.switchTab({ url: '/pages/requests/index' })
      })
    } catch (error) {
      // Outside the service area (422) comes with advice on what to do, too long for a toast.
      if (error.statusCode === 422) modal({ title: L('无法提交', "Can't submit"), content: userMessage(error, L('提交失败', 'Submission failed')), showCancel: false })
      else wx.showToast({ title: userMessage(error, L('提交失败', 'Submission failed')), icon: 'none' })
    }
    finally { this.setData({ submitting: false }) }
  }
})
