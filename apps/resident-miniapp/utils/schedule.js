// Booking slots in Beijing time, independent of the phone's own time zone.
const { isEn, L } = require('./i18n')
const { monthDay } = require('./translate')
const OFFSET_MS = 8 * 60 * 60 * 1000
const SLOTS = [
  { name: '上午', label: '上午 09:00–12:00', en: 'Morning 09:00–12:00', start: 9, end: 12 },
  { name: '下午', label: '下午 13:00–17:00', en: 'Afternoon 13:00–17:00', start: 13, end: 17 }
]
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_AHEAD = 7

function beijingParts(ms) {
  const d = new Date(ms + OFFSET_MS)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay() }
}

// Offer the earliest-available option, then the next seven days; omit today after its final slot.
function bookingDays(now = Date.now()) {
  const days = [{ label: L('尽快（审批后立即安排）', 'As soon as possible (right after approval)'), asap: true }]
  for (let offset = 0; offset <= DAYS_AHEAD; offset++) {
    const p = beijingParts(now + offset * 24 * 60 * 60 * 1000)
    if (offset === 0 && p.hour >= SLOTS[SLOTS.length - 1].end) continue
    const label = isEn()
      ? `${offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : WEEKDAYS_EN[p.weekday]}, ${monthDay(p.month, p.day)}`
      : `${offset === 0 ? '今天' : offset === 1 ? '明天' : offset === 2 ? '后天' : WEEKDAYS[p.weekday]} ${p.month}月${p.day}日`
    days.push({ label, year: p.year, month: p.month, day: p.day })
  }
  return days
}

function instant(day, hour) {
  return new Date(Date.UTC(day.year, day.month - 1, day.day, hour) - OFFSET_MS).toISOString()
}

// { preferredStart, preferredEnd } for the chosen day and slot, or nulls for "as soon as possible".
function windowFor(day, slot) {
  if (!day || day.asap) return { preferredStart: null, preferredEnd: null }
  return { preferredStart: instant(day, slot.start), preferredEnd: instant(day, slot.end) }
}

function slotOver(day, slot, now = Date.now()) {
  return !day.asap && Date.parse(instant(day, slot.end)) <= now
}

// The label of a slot in the current language.
function slotLabel(slot) { return slot ? L(slot.label, slot.en) : '' }

// Format a booked window with its date and time range; otherwise show the earliest-available label.
function windowText(start, end) {
  if (!start || !end) return L('尽快', 'As soon as possible')
  const pad = n => String(n).padStart(2, '0')
  const a = beijingParts(Date.parse(start))
  const b = beijingParts(Date.parse(end))
  const time = `${pad(a.hour)}:${pad(a.minute)}–${pad(b.hour)}:${pad(b.minute)}`
  return isEn() ? `${monthDay(a.month, a.day)}, ${time}` : `${a.month}月${a.day}日 ${time}`
}

// The same choice in a rebuilt list of days: "as soon as possible", or the same calendar date.
function sameDayIndex(days, previous) {
  if (!previous) return 0
  const index = days.findIndex(day => previous.asap ? day.asap
    : !day.asap && day.year === previous.year && day.month === previous.month && day.day === previous.day)
  return index < 0 ? 0 : index
}

module.exports = { SLOTS, bookingDays, sameDayIndex, windowFor, slotOver, windowText, slotLabel }
