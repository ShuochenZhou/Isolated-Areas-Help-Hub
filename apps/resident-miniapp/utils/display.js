const { isEn, L } = require('./i18n')
const { translate, MONTHS } = require('./translate')

// Store each localized label as a [Chinese, English] pair.
const categoryNames = {
  FOOD: ['食品', 'Food'], WATER: ['饮用水', 'Drinking Water'], HYGIENE: ['卫生用品', 'Hygiene'],
  MEDICAL: ['基础医疗用品', 'Basic Medical'], EMERGENCY: ['应急物资', 'Emergency'], OTHER: ['其他', 'Other']
}
const urgencyNames = {
  LOW: ['不紧急', 'Not urgent'], NORMAL: ['一般', 'Normal'], HIGH: ['较紧急', 'Urgent'], CRITICAL: ['非常紧急', 'Very urgent']
}
const requestStatusNames = {
  SUBMITTED: ['已提交', 'Submitted'], UNDER_REVIEW: ['审核中', 'Under review'], APPROVED: ['已批准', 'Approved'],
  SCHEDULED: ['已安排', 'Scheduled'], FULFILLED: ['已完成', 'Completed'], REJECTED: ['未通过', 'Declined'],
  CANCELLED: ['已取消', 'Cancelled']
}
const reservationStatusNames = {
  HELD: ['待领取', 'Ready to collect'], CONFIRMED: ['待领取', 'Ready to collect'], COLLECTED: ['已领取', 'Collected'],
  EXPIRED: ['已过期', 'Expired'], CANCELLED: ['已取消', 'Cancelled']
}
const paymentStatusNames = {
  CREATED: ['待支付', 'Unpaid'], PREPAY: ['待支付', 'Unpaid'], SUCCESS: ['已支付', 'Paid'], REFUNDING: ['退款中', 'Refunding'],
  REFUNDED: ['已退款', 'Refunded'], CLOSED: ['已关闭', 'Closed'], FAILED: ['支付失败', 'Payment failed']
}
const fulfillmentNames = { PICKUP: ['到点自取', 'Pickup'], DELIVERY: ['补给车配送', 'Cart delivery'] }
const servicePointStatusNames = {
  PLANNED: ['筹备中', 'Opening soon'], ACTIVE: ['开放中', 'Open'], PAUSED: ['暂停服务', 'Paused'], CLOSED: ['已关闭', 'Closed']
}
const cartStatusNames = {
  AVAILABLE: ['待命', 'Standing by'], LOADING: ['装货中', 'Loading'], IN_SERVICE: ['配送中', 'Delivering'],
  MAINTENANCE: ['维护中', 'Maintenance'], OFFLINE: ['离线', 'Offline']
}
const routeStatusNames = {
  PENDING: ['排队中', 'Queued'], COMPUTING: ['计算中', 'Computing'], READY: ['已生成', 'Ready'],
  DISPATCHED: ['已派车', 'Dispatched'], COMPLETED: ['已完成', 'Completed'], FAILED: ['计算失败', 'Failed']
}
const notificationNames = {
  REQUEST_RECEIVED: ['需求已收到', 'Request received'], REQUEST_CREATED: ['需求已收到', 'Request received'],
  REQUEST_UNDER_REVIEW: ['需求审核中', 'Request under review'],
  REQUEST_APPROVED: ['需求已批准，可预约物资', 'Request approved; supplies can be reserved'],
  REQUEST_SCHEDULED: ['需求已安排', 'Request scheduled'], REQUEST_FULFILLED: ['需求已完成', 'Request completed'],
  REQUEST_REJECTED: ['需求未通过', 'Request declined'], REQUEST_CANCELLED: ['需求已取消', 'Request cancelled'],
  REQUEST_STATUS_CHANGED: ['申请进度更新', 'Request status updated'],
  RESERVATION_HELD: ['预约成功', 'Reservation confirmed'], PAYMENT_SUCCEEDED: ['支付已完成', 'Payment complete'],
  PAYMENT_REFUNDED: ['退款已完成', 'Refund complete'], ROUTE_READY: ['服务路线已生成', 'Service route ready'],
  GENERAL_UPDATE: ['服务更新', 'Service update']
}

// Every reason the backend can return, so residents never see a raw backend message.
const errorMessages = [
  [/Invalid service window/i, ['所选时间无效，请选择 7 天内的上午或下午时段', 'That time is not available. Please choose a morning or afternoon slot within the next 7 days.']],
  [/Reserved inventory category must match/i, ['所选物资类别与已批准需求不一致', "These supplies don't match the category of the approved request."]],
  [/Pickup inventory must come from the assigned service point/i, ['请选择已安排服务点的物资', 'Please choose supplies from the assigned service point.']],
  [/Insufficient inventory/i, ['库存不足，请减少数量或选择其他物资', 'Not enough stock. Lower the quantity or choose other supplies.']],
  [/Request must be approved/i, ['该需求尚未批准，暂时不能预约', "This request hasn't been approved yet, so it can't be reserved."]],
  [/Feedback requires a fulfilled request/i, ['需求完成后才能提交反馈', 'Feedback can be given once the request is complete.']],
  [/Reservation is not collectible/i, ['该预约已领取、已过期或已取消，不能核销', 'This reservation was already collected, has expired or was cancelled, so it cannot be verified.']],
  [/Invalid pickup code/i, ['领取码不正确', 'Incorrect pickup code']],
  [/Reservation not found/i, ['预约编号不存在', 'Reservation not found']],
  [/Supply request not found|Request not found|Request was not found/i, ['未找到该申请', 'Request not found']],
  [/Inventory item not found/i, ['物资不存在或已下架', 'This item no longer exists or has been removed.']],
  [/Cart not found/i, ['补给车不存在', 'Supply cart not found']],
  [/Route plan not found/i, ['路线计划不存在', 'Route plan not found']],
  [/Cannot transition/i, ['当前状态不能执行该操作，请刷新后重试', "This can't be done in the current status. Please refresh and try again."]],
  [/只有待审核的申请可以自己取消/, ['只有待审核的申请可以自己取消；已有处理结果的申请如需取消，请拨打社区服务热线。', 'Only requests still waiting for review can be cancelled here; to cancel one that has already been decided, please call the community hotline.']],
  [/Pickup requests must be scheduled at a service point/i, ['自取需求需要安排服务点', 'Pickup requests need a service point.']],
  [/Delivery requests must be scheduled on a mobile cart/i, ['配送需求需要安排补给车', 'Delivery requests need a supply cart.']],
  [/Scheduling requires exactly one/i, ['请选择一个服务点或一辆补给车', 'Choose one service point or one supply cart.']],
  [/Invalid operator credentials/i, ['账号或运营密码错误', 'Incorrect account or operator password']],
  [/Invalid CloudRun identity/i, ['微信身份校验失败，请重新打开小程序', 'WeChat identity check failed. Please reopen the WeChat application.']],
  [/Invalid Idempotency-Key/i, ['请求编号无效，请重试', 'Invalid request ID. Please try again.']],
  [/original request is still processing/i, ['上一次提交仍在处理中，请稍候刷新', 'Your last submission is still being processed. Please refresh in a moment.']],
  [/record changed; refresh and retry/i, ['数据已被他人更新，请刷新后重试', 'Someone else updated this. Please refresh and try again.']],
  [/conflicts with an existing record/i, ['与已有记录冲突，请刷新后重试', 'This conflicts with an existing record. Please refresh and try again.']],
  [/request body is invalid/i, ['填写内容有误，请检查后重试', 'Some details are not valid. Please check and try again.']],
  [/do not have permission/i, ['没有权限执行该操作', "You don't have permission to do this."]],
  [/requested resource does not exist/i, ['请求的内容不存在', 'What you asked for does not exist.']],
  [/unexpected error occurred/i, ['服务暂时异常，请稍后重试', 'Something went wrong on our side. Please try again later.']],
  [/credentials are not configured/i, ['收费服务尚未开放，请选择公益免费物资', 'Paid supplies are not available yet. Please choose free supplies.']],
  [/real WeChat login is required/i, ['支付需要真实微信登录', 'Payment requires a real WeChat login.']],
  [/Payment|Refund|subsidized/i, ['收费服务尚未开放', 'Paid supplies are not available yet.']]
]

function local(pair) { return pair && (isEn() ? pair[1] : pair[0]) }
function label(map, value) { return local(map[value]) || value || '—' }
function categoryName(value) { return label(categoryNames, value) }
function urgencyName(value) { return label(urgencyNames, value) }
function requestStatusName(value) { return label(requestStatusNames, value) }
function reservationStatusName(value) { return label(reservationStatusNames, value) }
function paymentStatusName(value) { return label(paymentStatusNames, value) }
function fulfillmentName(value) { return label(fulfillmentNames, value) }
function servicePointStatusName(value) { return label(servicePointStatusNames, value) }
function cartStatusName(value) { return label(cartStatusNames, value) }
function routeStatusName(value) { return label(routeStatusNames, value) }
function notificationName(value) { return local(notificationNames[value]) || L('服务更新', 'Service update') }

function pad(number) { return String(number).padStart(2, '0') }

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return isEn() ? `${MONTHS[date.getMonth()]} ${date.getDate()}, ${time}` : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

// The backend sends LocalTime as "08:30:00".
function clock(value) { return value ? String(value).slice(0, 5) : '' }

function openingHours(point) {
  return point && point.opensAt && point.closesAt ? `${clock(point.opensAt)}–${clock(point.closesAt)}` : ''
}

function userMessage(error, fallback = L('操作失败，请稍后重试', 'Something went wrong. Please try again later.')) {
  const message = error && (error.message || error.errMsg) || ''
  if (error && error.localized && message) return message
  if (error && error.statusCode === 429) return L('操作太频繁，请稍后再试', 'Too many attempts. Please try again later.')
  if (error && error.statusCode === 503) return L('该服务尚未开放，请稍后再试', 'This service is not available yet. Please try again later.')
  const known = errorMessages.find(([pattern]) => pattern.test(message))
  if (known) return local(known[1])
  // Field validation errors look like "quantity: must be less than or equal to 100".
  if (/^[a-zA-Z]+: /.test(message)) return L('填写内容有误，请检查后重试', 'Some details are not valid. Please check and try again.')
  if (/^[\x00-\x7F]*$/.test(message) && message) return fallback
  if (isEn() && message) {
    // Chinese from the backend: its English when it is a known sentence, else the fallback.
    const english = translate(message)
    return /[一-鿿]/.test(english) ? fallback : english
  }
  return message || fallback
}

module.exports = {
  categoryNames, categoryName, urgencyName, requestStatusName, reservationStatusName,
  paymentStatusName, fulfillmentName, servicePointStatusName, cartStatusName, routeStatusName,
  notificationName, dateTime, clock, openingHours, userMessage
}
