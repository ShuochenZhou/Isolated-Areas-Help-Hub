// WeChat enables direct and timeline sharing only on pages that define these handlers. Every page
// shares a stable home-page entry because page-specific state is not meaningful to another user.
const { L, leavingBriefly } = require('./i18n')

function title() { return L('邻需通 · 青浦公益免费生活物资', 'Help Hub · Free Daily Essentials in Qingpu') }

function shareToFriends() {
  leavingBriefly()
  return { title: title(), path: '/pages/home/index' }
}

// Moments open the shared page itself, so only the home page offers this.
function shareToTimeline() {
  leavingBriefly()
  return { title: title() }
}

module.exports = { shareToFriends, shareToTimeline }
