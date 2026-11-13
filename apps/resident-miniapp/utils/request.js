const config = require('../config')
const { callApi } = require('./cloud')
const { L, localError } = require('./i18n')

function uuid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`
}

function normalizeError(error, fallback = L('网络连接失败，请稍后重试', 'Network error. Please try again later.')) {
  if (error instanceof Error) return error
  const raw = error && (error.errMsg || error.message) || ''
  if (/timeout/i.test(raw)) return localError('网络请求超时，请检查网络后重试', 'The request timed out. Please check your network and try again.')
  if (/fail/i.test(raw)) return localError('无法连接服务，请检查网络或稍后重试', "Can't reach the service. Please check your network or try again later.")
  return new Error(raw || fallback)
}

async function request(options, retried = false) {
  const app = getApp()
  try { await app.ensureLogin() } catch (error) { throw normalizeError(error, L('登录失败，请稍后重试', 'Sign-in failed. Please try again later.')) }
  const idempotencyKey = options.idempotent ? (options.idempotencyKey || uuid()) : ''
  const requestUrl = idempotencyKey
    ? `${options.url}${options.url.includes('?') ? '&' : '?'}idempotencyKey=${encodeURIComponent(idempotencyKey)}`
    : options.url
  return new Promise((resolve, reject) => {
    callApi({
      path: requestUrl,
      method: options.method || 'GET',
      timeout: options.timeout || 15000,
      data: options.data,
      header: {
        Authorization: `Bearer ${app.globalData.token}`,
        'Content-Type': 'application/json',
        'X-Request-ID': uuid(),
        'X-Client-Release': config.releaseId,
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {})
      }
    }).then(async ({ statusCode, data }) => {
        if (statusCode === 401 && !retried) {
          try {
            await app.ensureLogin(true)
            resolve(await request({ ...options, idempotencyKey }, true))
          } catch (error) { reject(normalizeError(error, L('登录已失效，请重试', 'Your session expired. Please try again.'))) }
          return
        }
        if (statusCode >= 200 && statusCode < 300) return resolve(data)
        const error = new Error(data && (data.detail || data.message) || L(`请求失败 (${statusCode})`, `Request failed (${statusCode})`))
        error.statusCode = statusCode
        error.requestId = data && data.requestId
        reject(error)
      }).catch(error => reject(normalizeError(error)))
  })
}

module.exports = { request, uuid, normalizeError }
