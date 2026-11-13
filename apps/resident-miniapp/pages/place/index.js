const { readPlace, savePlace, withinBounds, coordinateText } = require('../../utils/place')
const { request } = require('../../utils/request')
const { shareToFriends } = require('../../utils/share')
const { userMessage } = require('../../utils/display')
const { L, pick, setTitle } = require('../../utils/i18n')
const { translate } = require('../../utils/translate')

// Only this far from the nearest service point is served at all (the backend refuses the rest).
const SERVICE_RADIUS_METERS = 10000

const TEXT = {
  zh: {
    addressLabel: '详细地址 *', addressPlaceholder: '例如：青浦区青湖路 88 弄 5 号 302 室',
    addressHint: '填写到门牌号和室号，再点“查找位置”，从结果中选出你家所在的地点。',
    search: '查找位置', searching: '查找中…', resultsTitle: '请选择你所在的地点',
    noResult: '没有找到这个地址。可以只填小区名或道路加门牌号再试，也可以在下方地图上拖动定位。',
    unavailable: '地址定位暂时不可用，请在下方地图上拖动，让中心标记对准你家。',
    mapTip: '可拖动地图微调位置（可选）', located: '已定位', adjusted: '已按地图微调',
    notLocated: '尚未定位', nearest: '离最近的服务点约', km: ' 公里',
    tooFar: '这个位置 10 公里内没有服务点，不在服务范围内，无法在这里提交求助。请确认地址是否正确。',
    outOfRange: '该位置不在服务覆盖范围内，请重新选择。', confirm: '确认使用此位置'
  },
  en: {
    addressLabel: 'Full address *', addressPlaceholder: 'e.g. Room 302, No. 5, Lane 88, Qinghu Road, Qingpu',
    addressHint: 'Include your building and room number, tap "Find", then choose your place from the results.',
    search: 'Find', searching: 'Finding…', resultsTitle: 'Choose where you are',
    noResult: "We couldn't find that address. Try just the estate name, or the road and number, or drag the map below.",
    unavailable: 'Address lookup is unavailable right now. Drag the map below so the centre marker is on your home.',
    mapTip: 'Drag the map to fine-tune (optional)', located: 'Located', adjusted: 'Adjusted on the map',
    notLocated: 'Not located yet', nearest: 'About ', km: ' km to the nearest service point',
    tooFar: "No service point within 10 km: this is outside our service area and requests can't be submitted here. Please check your address.",
    outOfRange: 'This location is outside the service area. Please choose again.', confirm: 'Use this location'
  }
}

Page({
  onShareAppMessage: shareToFriends,
  data: {
    t: TEXT.zh,
    // Bound to the map; changed only to jump to a found place, so a drag is never undone.
    initialLatitude: 31.1665, initialLongitude: 121.1111,
    latitude: 31.1665, longitude: 121.1111,
    coordinates: '', address: '', searching: false, results: [], chosenIndex: -1, notice: '',
    located: false, adjusted: false, outOfRange: false, rangeText: '', tooFar: false
  },
  onLoad() {
    const place = readPlace()
    setTitle('填写我的位置', 'My Location')
    // A place the resident saved before (with its address) counts as located; a default one does not.
    const saved = place.confirmed && !place.isDefault && Boolean(place.address)
    this.setData({
      t: pick(TEXT),
      initialLatitude: place.latitude, initialLongitude: place.longitude,
      latitude: place.latitude, longitude: place.longitude,
      address: saved ? place.address : '', coordinates: coordinateText(place), located: saved
    })
    if (saved) this.checkRange()
  },
  onReady() { this.mapContext = wx.createMapContext('placePicker', this) },
  bindAddress(e) { this.setData({ address: e.detail.value }) },
  async search() {
    const keyword = this.data.address.trim()
    if (keyword.length < 2) return wx.showToast({ title: L('请先填写详细地址', 'Please enter your address first'), icon: 'none' })
    if (this.data.searching) return
    this.setData({ searching: true, notice: '', results: [], chosenIndex: -1 })
    try {
      const found = await request({ url: `/resident/places/search?keyword=${encodeURIComponent(keyword)}` })
      if (!found.available) return this.setData({ notice: this.data.t.unavailable })
      const results = (found.places || []).map(item => ({ ...item, title: translate(item.title), address: translate(item.address) }))
      if (!results.length) return this.setData({ notice: this.data.t.noResult })
      this.setData({ results })
      // One clear match needs no extra tap.
      if (results.length === 1) this.chooseAt(0)
    } catch (error) {
      this.setData({ notice: userMessage(error, this.data.t.unavailable) })
    } finally { this.setData({ searching: false }) }
  },
  choose(e) { this.chooseAt(Number(e.currentTarget.dataset.index)) },
  chooseAt(index) {
    const place = this.data.results[index]
    if (!place) return
    this.setData({
      chosenIndex: index, initialLatitude: place.latitude, initialLongitude: place.longitude,
      latitude: place.latitude, longitude: place.longitude, coordinates: coordinateText(place),
      located: true, adjusted: false, outOfRange: !withinBounds(place.latitude, place.longitude)
    })
    this.checkRange()
  },
  regionChange(e) {
    if (e.type !== 'end') return
    // Only the resident's own drag moves the chosen point; jumping to a result also ends a region change.
    const byHand = e.causedBy === 'drag' || e.causedBy === 'gesture'
    if (!byHand || !this.mapContext) return
    this.mapContext.getCenterLocation({
      success: center => {
        const latitude = Number(Number(center.latitude).toFixed(6))
        const longitude = Number(Number(center.longitude).toFixed(6))
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
        this.setData({
          latitude, longitude, coordinates: coordinateText({ latitude, longitude }),
          located: true, adjusted: true, outOfRange: !withinBounds(latitude, longitude)
        })
        this.checkRange()
      }
    })
  },
  // How far the chosen point is from the nearest service point, and whether it is served at all.
  async checkRange() {
    const { latitude, longitude } = this.data
    if (!withinBounds(latitude, longitude)) return this.setData({ rangeText: '', tooFar: false })
    const asked = `${latitude},${longitude}`
    this.rangeAsked = asked
    try {
      const points = await request({ url: `/resident/service-points?latitude=${latitude}&longitude=${longitude}&radiusMeters=${SERVICE_RADIUS_METERS}` })
      if (this.rangeAsked !== asked) return
      const nearest = points.reduce((best, point) => Math.min(best, Number(point.distanceMeters)), Infinity)
      this.setData({
        tooFar: !Number.isFinite(nearest),
        rangeText: Number.isFinite(nearest) ? `${this.data.t.nearest}${(nearest / 1000).toFixed(1)}${this.data.t.km}` : ''
      })
    } catch (error) { /* The backend checks the distance again on submission. */ }
  },
  confirm() {
    const address = this.data.address.trim()
    if (!address) return wx.showToast({ title: L('请填写详细地址', 'Please enter your full address'), icon: 'none' })
    if (!this.data.located) {
      return wx.showToast({ title: L('请先点“查找位置”并选择地点', 'Tap "Find" and choose your place first'), icon: 'none' })
    }
    if (this.data.outOfRange || !withinBounds(this.data.latitude, this.data.longitude)) {
      return wx.showToast({ title: L('请在服务覆盖范围内选点', 'Please pick a point inside the service area'), icon: 'none' })
    }
    savePlace({ latitude: this.data.latitude, longitude: this.data.longitude, address })
    wx.showToast({ title: L('位置已保存', 'Location saved'), icon: 'success', duration: 600 })
    setTimeout(() => wx.navigateBack(), 620)
  }
})
