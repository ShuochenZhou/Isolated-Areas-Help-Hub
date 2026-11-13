const config = require('../config')
const { localError } = require('./i18n')

function callApi({ path, method = 'GET', data, header = {}, timeout = 15000 }) {
  if (!wx.cloud || typeof wx.cloud.callContainer !== 'function') {
    return Promise.reject(localError('当前微信版本不支持云托管，请更新微信后重试', 'This WeChat version cannot reach the service. Please update WeChat and try again.'))
  }
  return new Promise((resolve, reject) => {
    wx.cloud.callContainer({
      config: { env: config.cloudEnv },
      path: `${config.apiPathPrefix}${path}`,
      method,
      timeout,
      data,
      header: {
        'X-WX-SERVICE': config.cloudService,
        ...header
      },
      success: resolve,
      fail: reject
    })
  })
}

module.exports = { callApi }
