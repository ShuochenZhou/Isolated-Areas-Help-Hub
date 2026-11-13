// WeChat only grants wx.getLocation / wx.chooseLocation to approved accounts, so this
// WeChat application never calls them. Residents instead pick a reference point on an in-app
// map (pages/place), and every screen that needs coordinates reads it from here.
const { L } = require('./i18n')
const { translate } = require('./translate')
const STORAGE_KEY = 'servicePlace'
// Each resident's own random point inside the service area, assigned by the backend. Used
// whenever they have not picked a place, so a request can be sent without touching the map.
const DEFAULT_KEY = 'defaultPlace'

// The backend only serves this metropolitan area and rejects coordinates outside it.
const BOUNDS = { minLatitude: 30, maxLatitude: 32, minLongitude: 120, maxLongitude: 123 }

// Used for browsing only until the resident's default location has loaded (and for staff).
// Never submitted as a service address: `confirmed` stays false so the request form keeps asking.
const FALLBACK = { latitude: 31.1665, longitude: 121.1111, address: '上海市青浦区', confirmed: false }

function withinBounds(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= BOUNDS.minLatitude && latitude <= BOUNDS.maxLatitude
    && longitude >= BOUNDS.minLongitude && longitude <= BOUNDS.maxLongitude
}

function stored(key) {
  let value = null
  try { value = wx.getStorageSync(key) } catch (error) { value = null }
  const latitude = Number(value && value.latitude)
  const longitude = Number(value && value.longitude)
  return withinBounds(latitude, longitude) ? { latitude, longitude, address: (value.address || '').trim() } : null
}

// The place the resident picked, else their default location, else the browsing fallback.
function readPlace() {
  const picked = stored(STORAGE_KEY)
  if (picked) return { ...picked, confirmed: true }
  const assigned = stored(DEFAULT_KEY)
  if (assigned) return { ...assigned, confirmed: true, isDefault: true }
  return { ...FALLBACK }
}

// Loads the resident's default location once; later calls return the cached one.
let loading = null
function ensureDefaultPlace() {
  if (stored(DEFAULT_KEY)) return Promise.resolve()
  if (loading) return loading
  const { request } = require('./request')
  loading = request({ url: '/resident/profile' }).then(profile => {
    const latitude = Number(profile && profile.defaultLatitude)
    const longitude = Number(profile && profile.defaultLongitude)
    if (withinBounds(latitude, longitude)) wx.setStorageSync(DEFAULT_KEY, { latitude, longitude })
  }).catch(() => { /* Pages fall back to asking for a place. */ }).then(() => { loading = null })
  return loading
}

function savePlace(place) {
  const saved = {
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    address: (place.address || '').trim()
  }
  wx.setStorageSync(STORAGE_KEY, saved)
  const app = getApp()
  if (app) app.globalData.location = { latitude: saved.latitude, longitude: saved.longitude }
  return { ...saved, confirmed: true }
}

function coordinateText(place) {
  return `${Number(place.latitude).toFixed(5)}, ${Number(place.longitude).toFixed(5)}`
}

function placeLabel(place) {
  return translate(place.address) || (place.isDefault ? L('系统分配的默认位置', 'Default location assigned to you') : coordinateText(place))
}

// Identity of a picked place, so a page can tell whether it changed while it was hidden.
function placeKey(place) {
  return `${place.latitude},${place.longitude},${place.address || ''},${place.confirmed}`
}

module.exports = { BOUNDS, readPlace, savePlace, ensureDefaultPlace, withinBounds, coordinateText, placeLabel, placeKey }
