// Interface language. The resident picks Chinese or English each time the WeChat application starts
// (pages/home shows the picker); Chinese is the original text and English mirrors it.
const STORAGE_KEY = 'language'
// Reuse a saved default language on launch and skip the picker.
const REMEMBER_KEY = 'languageRemembered'
let current = null
// Set only while inLanguage runs: text shown in another language than the interface's.
let override = null

function lang() {
  if (!current) {
    let saved = ''
    try { saved = wx.getStorageSync(STORAGE_KEY) } catch (error) { saved = '' }
    current = saved === 'en' ? 'en' : 'zh'
  }
  return current
}

function isEn() { return (override || lang()) === 'en' }

// Runs fn as if the interface were in `value` ('zh' or 'en'): the assistant answers in the language
// the resident wrote in, which may not be the interface's.
function inLanguage(value, fn) {
  const before = override
  override = value === 'en' || value === 'zh' ? value : null
  try { return fn() } finally { override = before }
}

// Return the localized value that matches the active interface language.
function L(zh, en) { return isEn() ? en : zh }

// Page text tables are { zh: {...}, en: {...} }.
function pick(table) { return table[lang()] }

const TAB_TEXT = {
  zh: ['首页', '地图', '求助', '进度', '我的'],
  en: ['Home', 'Map', 'Get Help', 'Status', 'Me']
}

function applyTabBar() {
  TAB_TEXT[lang()].forEach((text, index) => wx.setTabBarItem({ index, text, fail() {} }))
}

function setTitle(zh, en) { wx.setNavigationBarTitle({ title: L(zh, en), fail() {} }) }

function isRemembered() {
  try { return wx.getStorageSync(REMEMBER_KEY) === true } catch (error) { return false }
}

function setLang(value, remember = false) {
  current = value === 'en' ? 'en' : 'zh'
  try {
    wx.setStorageSync(STORAGE_KEY, current)
    wx.setStorageSync(REMEMBER_KEY, !!remember)
  } catch (error) { /* Still applies to this launch. */ }
  applyTabBar()
}

// The OK / Cancel buttons of wx.showModal follow the phone's language, not the chosen one.
// In Chinese nothing is added, so the dialogs stay exactly as they were.
function modal(options) {
  return wx.showModal(isEn() ? { confirmText: 'OK', cancelText: 'Cancel', ...options } : options)
}

// An error whose message is already written for residents in the current language.
function localError(zh, en) {
  const error = new Error(L(zh, en))
  error.localized = true
  return error
}

// Called before handing the resident to WeChat's map, the phone dialler, payment or sharing:
// coming back from those is not a new visit, so the language picker is not shown again.
function leavingBriefly() {
  const app = getApp()
  if (app) app.globalData.leavingBriefly = true
}

module.exports = { lang, isEn, inLanguage, L, pick, setLang, isRemembered, leavingBriefly, setTitle, applyTabBar, modal, localError }
