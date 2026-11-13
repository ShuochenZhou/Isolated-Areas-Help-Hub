// The assistant in English. Answers written from live data, and the assistant's fixed sentences, come
// from the backend in Chinese; replyText shows them in English when the resident asked in English
// (the assistant page runs it inside inLanguage, whatever the interface language). A model's own
// replies are already in the resident's language and are shown as they are. Without a model the
// backend looks questions up with Chinese keywords, so a question asked in English is also sent in
// those words (lookupFor).
const { isEn, lang } = require('./i18n')
const { translate, term, amount, monthDay, ITEMS } = require('./translate')

// Words in the English item names that say nothing about what the item is.
const GENERIC = ['kit', 'pack', 'packs', 'set', 'size', 'bottles', 'bottle', 'pcs', 'basic', 'day', 'night', 'bar',
  'box', 'boxes', 'can', 'cans', 'free', 'and', 'the', 'shelf', 'stable', 'living', 'emergency', 'care', 'digital',
  // Category words: "food?" asks about all food, not the one item whose name contains the word.
  'food', 'hygiene', 'medical']
// Other words residents use for the same things.
const SYNONYMS = {
  biscuit: 'crackers', biscuits: 'crackers', cookie: 'crackers', cookies: 'crackers', spam: 'luncheon',
  nappy: 'diapers', nappies: 'diapers', diaper: 'diapers', toilet: 'tissues', paper: 'tissues',
  tissue: 'tissues', torch: 'flashlight', torches: 'flashlight', battery: 'batteries', sanitizer: 'disinfectant',
  sanitiser: 'disinfectant', alcohol: 'disinfectant', period: 'sanitary', pad: 'pads', toothbrush: 'toothbrush',
  toothpaste: 'toothpaste', candle: 'candles', lighters: 'lighter', blankets: 'blanket', raincoats: 'raincoat',
  mask: 'masks', noodle: 'noodles', oat: 'oats', oatmeal: 'oats', porridge: 'oats', thermometers: 'thermometer',
  soaps: 'soap', detergents: 'detergent', laundry: 'detergent', crackers: 'crackers'
}

function words(text) { return String(text).toLowerCase().match(/[a-z]+/g) || [] }

// Remove the public-service prefix and package size to match the backend's core product name.
function coreName(name) { return name.replace('公益', '').replace(/[\s\d].*$/, '') }

// English word -> Chinese item names, built from the names shown in the app.
const ITEM_WORDS = {}
Object.keys(ITEMS).forEach(zh => {
  words(ITEMS[zh]).filter(word => word.length > 2 && GENERIC.indexOf(word) < 0).forEach(word => {
    (ITEM_WORDS[word] = ITEM_WORDS[word] || []).push(coreName(zh))
  })
})

// The items the question names. When some match more of its words ("baby diapers": the baby
// diapers, not the adult ones), only those are kept.
function itemsIn(text) {
  const score = {}
  const order = []
  words(text).forEach(raw => {
    const word = SYNONYMS[raw] || raw
    const names = ITEM_WORDS[word] || ITEM_WORDS[word.replace(/e?s$/, '')] || ITEM_WORDS[`${word}s`] || []
    names.forEach(name => {
      if (!(name in score)) { score[name] = 0; order.push(name) }
      score[name]++
    })
  })
  const best = Math.max(0, ...order.map(name => score[name]))
  return order.filter(name => score[name] === best)
}

const has = (text, pattern) => pattern.test(text)
const HAN = /[一-鿿]/

// The language a message is written in, as the backend decides it: each Chinese character counts for
// two Latin letters; a tie (digits only, say) is '' and follows the interface.
function messageLanguage(message) {
  const text = String(message || '')
  const han = (text.match(/[一-鿿]/g) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  if (han * 2 > latin) return 'zh'
  if (latin > han * 2) return 'en'
  return ''
}

// The question in the words the keyword lookup understands, or '' when there is nothing to map. Only
// used by the backend when no model is available; a question asked in Chinese needs no mapping.
function lookupFor(message) {
  const language = messageLanguage(message)
  if (language === 'zh' || (language === '' && !isEn())) return ''
  const text = String(message || '').toLowerCase()
  const items = itemsIn(text)
  // Only real danger is an emergency: "help me set my location" asks for help with the app.
  if (has(text, /\b(danger|dying|unconscious|passed out|faint(ed|ing)?|collapsed|bleed(ing)?|fire|police|ambulance|heart attack|stroke|seizure|can'?t breathe|cannot breathe|not breathing|overdose)\b|\bcall 1[12]0\b/)) return '救命'
  if (has(text, /\b(notifications?|notices?|messages?|updates?)\b/)) return '我的通知'
  if (has(text, /\b(code|codes|reservation|reservations|booking|bookings|booked|reserved)\b/)) return '我的领取码'
  if (has(text, /\b(how|process|steps?|procedure)\b/) && has(text, /\b(request|apply|collect|pick ?up|deliver(y|ed)?|get|order|use|reserve|book|work)\b/)) return '怎么申请和领取？'
  const number = /(?:request|order|application)\s*(?:no\.?|number)?\s*#?\s*(\d+)|#\s*(\d+)/.exec(text)
  if (number) return `申请 #${number[1] || number[2]} 进度`
  if (has(text, /\b(status|progress|track(ing)?|my requests?|my orders?|my applications?)\b/)) return '我的申请进度'
  if (items.length) return `有${items.join('、')}吗？`
  if (has(text, /\b(food|eat|eating|snacks?|meals?|groceries)\b/)) return '有什么吃的？'
  if (has(text, /\b(drinks?|drinking)\b/)) return '有什么喝的？'
  if (has(text, /\b(hygiene|toiletries|cleaning|wash(ing)?)\b/)) return '有什么洗漱的？'
  if (has(text, /\b(medical|medicine|medicines|medication|drugs?|health|first aid)\b/)) return '有什么药？'
  if (has(text, /\b(emergency|emergencies)\b/)) return '应急物资有吗？'
  if (has(text, /\b(supplies|supply|available|stock|items?|inventory|what do you have|what is there|what's there|anything)\b/)) return '现在有哪些物资？'
  // "My location" is the resident's own place, not a service point, so "location" alone does not count.
  if (has(text, /\b(service points?|where|open|opens|opening|close|closes|closing|hours|nearby|nearest)\b/)) return '服务点在哪，几点开门？'
  return ''
}

const FIXED = {
  '我可以直接查询：①“现在有哪些物资”“有大米吗” ②“服务点在哪、几点开门” ③“我的申请进度” ④“我的预约和领取码” ⑤“怎么申请和领取”。所有物资均为公益免费。':
    'I can look up: ① "What supplies are available?", "Is there any rice?" ② "Where are the service points and when do they open?" ③ "My request status" ④ "My bookings and pickup codes" ⑤ "How do I request and collect?". All supplies are free.',
  '如有人身危险或紧急医疗情况，请立即拨打 120；涉及治安或人身安全请拨打 110。这里可以继续帮您查询青浦公益物资和服务点，但不能代替紧急救援。':
    'If someone is in danger or needs urgent medical help, call 120 right away; for police or personal safety, call 110. I can keep helping you find free supplies and service points in Qingpu, but I cannot replace emergency services.',
  '当前没有可领取库存；您可以在首页提交具体需求，我们会记录并跟进。':
    'Nothing is in stock right now. You can submit what you need from the home page and we will follow up.',
  '当前库存已全部预约完；您可以在首页提交具体需求，我们会记录并跟进。':
    'Everything in stock has been reserved. You can submit what you need from the home page and we will follow up.',
  '您还没有提交过申请。可在“求助”页填写所需物资、数量和位置。':
    'You have not made any requests yet. Tell me what you need and how many, and I can request it for you.',
  '您还没有物资预约。申请获批后，可在“进度”页点“预约物资”获得领取码。':
    'You have no bookings yet. Once a request is approved, you get a pickup code for it.',
  '当前没有匹配的服务点，请改用“青浦有哪些服务点”查询全部青浦点位。':
    'No service point matches. Ask "What service points are there in Qingpu?" to see them all.',
  '操作已确认并完成。': 'Confirmed and done.',
  '请补充您需要的物资或服务信息。': 'Please tell me a little more about the supplies or service you need.',
  '为了安全，工具调用次数已达到上限。请缩小问题范围后重试。': 'For safety, I stopped after too many lookups. Please ask a narrower question.',
  '申请信息暂时无法识别，请稍后重试。': "I couldn't read that request just now. Please try again later.",
  '好的，已放弃这项操作，没有做任何修改。': "OK, I've dropped that. Nothing was changed.",
  '您还没有设置位置。告诉我您家的详细地址（例如：青浦区青湖路 88 弄 5 号 302 室），我来帮您设置。':
    "You haven't set your location yet. Tell me your full address (for example: Room 302, No. 5, Lane 88, Qinghu Rd, Qingpu District) and I'll set it for you.",
  '您还没有收到任何通知。': "You haven't had any updates yet.",
  '您还没有选择补给车配送的申请。': "You don't have any request for supply cart delivery.",
  '资料暂时无法读取，请稍后再试。': "I couldn't read your profile just now. Please try again later.",
  '地址查询暂时不可用。请在首页“当前位置”右侧点“设置”，在地图上拖动选出您家的位置。':
    'Address search is unavailable right now. On Home, tap "Set" next to "Your location" and drag the map to your home.',
  '找到的地点离最近的服务点都超过 10 公里，不在服务范围内。请确认地址是否正确，例如加上“青浦区”再说一次。':
    'Every place I found is more than 10 km from the nearest service point, outside our service area. Please check the address, for example add "Qingpu District", and tell me again.',
  '已切换为英文界面。': 'Switched the app to English.',
  '已切换为中文界面。': 'Switched the app to Chinese.',
  '您的位置 10 公里内没有服务点，不在服务范围内。可以问“青浦有哪些服务点”查看全部点位。':
    'There is no service point within 10 km of your location, so it is outside our service area. Ask "What service points are there in Qingpu?" to see them all.'
}

// A page or button named in an English reply, as the resident's screen shows it: under the Chinese
// interface the Chinese label comes first, so it can be found, with the English after it.
function ui(en, zh) { return lang() === 'zh' ? `"${zh}" (${en})` : `"${en}"` }

// How to do things in the app (the backend's GUIDES), in English.
const GUIDES = {
  '设置位置：在首页“当前位置”右侧点“设置”（或“修改”），也可以在地图页点“设置我的位置”。填写详细地址（到门牌号和室号），点“查找位置”，从结果里选出您家，最后点“确认使用此位置”。不需要开启手机定位。也可以直接把地址告诉我，我来帮您设置。':
    () => `To set your location: on ${ui('Home', '首页')}, tap ${ui('Set', '设置')} (or ${ui('Change', '修改')}) next to ${ui('Your location', '当前位置')}, or on ${ui('Map', '地图')} tap ${ui('Set my location', '设置我的位置')}. Enter your full address (down to the building and room number), tap ${ui('Find', '查找位置')}, choose your home from the results, then tap ${ui('Use this location', '确认使用此位置')}. You don't need to turn on location services. Or just tell me your address and I'll set it for you.`,
  '申请物资：在“求助”页选择需要的物资和数量（库存里没有的选“其他”并写明），选择紧急程度、领取方式（到点自取或补给车配送）和时间，确认位置后点“确认提交”。也可以直接告诉我要什么、要多少，我来帮您申请。':
    () => `To request supplies: on ${ui('Get Help', '求助')}, choose the supplies and quantity (for something not in stock, choose ${ui('Other', '其他')} and describe it), then the urgency, how to receive it (pickup or cart delivery) and the time, check your location and tap ${ui('Submit', '确认提交')}. Or just tell me what you need and how many, and I'll request it for you.`,
  '取消申请：在“进度”页找到还在等待审核的申请，点“取消申请”。已经批准或已完成的申请不能自己取消，请拨打社区服务热线。也可以直接告诉我要取消哪个申请。':
    () => `To cancel a request: on ${ui('Status', '进度')}, find the request that is still waiting for review and tap ${ui('Cancel request', '取消申请')}. Requests already approved or completed can't be cancelled here; please call the community hotline. Or just tell me which request to cancel.`,
  '查看领取码：在“我的”页点“我的领取码”。领取码保留 48 小时，到点自取或配送送达时出示。也可以直接问我“我的领取码”。':
    () => `To see your pickup codes: on ${ui('Me', '我的')}, tap ${ui('My Pickup Codes', '我的领取码')}. A code is kept for 48 hours; show it when you collect or when the delivery arrives. Or just ask me "my pickup codes".`,
  '查看申请进度：打开“进度”页，下拉可以刷新。也可以直接问我“我的申请进度”。':
    () => `To check your requests: open ${ui('Status', '进度')} and pull down to refresh. Or just ask me "my request status".`,
  '查看配送：在“进度”页点申请下方的“查看配送位置”，或打开“地图”页看补给车的位置和预计到达时间。也可以直接问我“补给车到哪了”。':
    () => `To follow a delivery: on ${ui('Status', '进度')}, tap ${ui('Track delivery', '查看配送位置')} under the request, or open ${ui('Map', '地图')} to see the supply cart and when it should arrive. Or just ask me "where is my delivery?".`,
  '服务评价：申请完成后，在“进度”页点“服务反馈”，打 1 到 5 星，可以填以前和这次各花了多少分钟，以及意见。每个申请只能评价一次。也可以直接告诉我打几星，我来帮您提交。':
    () => `To rate a service: once a request is complete, tap ${ui('Give feedback', '服务反馈')} on ${ui('Status', '进度')}, give 1 to 5 stars and, if you like, how many minutes it used to take, how long it took this time, and any comments. Each request can be rated once. Or just tell me how many stars and I'll submit it for you.`,
  '修改资料：在“我的”页点上方的资料卡，可以修改称呼和家庭人数。也可以直接告诉我要改成什么。':
    () => `To change your profile: on ${ui('Me', '我的')}, tap the profile card at the top to change your name and household size. Or just tell me what to change it to.`,
  '切换语言：打开小程序时首页会请您选择中文或英文（勾选过“设为默认语言”就不会再问）。也可以直接告诉我“切换成英文”或“切换成中文”。':
    () => `To switch language: when the app opens, ${ui('Home', '首页')} asks you to choose Chinese or English (unless you ticked ${ui("Set as default, don't ask again", '设为默认语言，以后不再询问')}). Or just tell me "switch to English" or "switch to Chinese".`,
  '社区服务热线：18321961090。在“我的”页点“社区服务热线”可以直接拨打，也可以让我帮您拨打。':
    () => `Community hotline: 18321961090. Tap ${ui('Community Hotline', '社区服务热线')} on ${ui('Me', '我的')} to call it, or ask me to call it for you.`,
  '查看通知：在“我的”页点“进度通知”。也可以直接问我“我有什么通知”。':
    () => `To see your updates: on ${ui('Me', '我的')}, tap ${ui('Status Updates', '进度通知')}. Or just ask me "any updates for me?".`,
  '预约物资：工作人员已批准、但还没有领取码的申请，在“进度”页点“预约物资”，选好同类物资和数量后生成领取码（保留 48 小时）。也可以直接告诉我为哪个申请预约。':
    () => `To reserve supplies: for a request staff have approved but that has no pickup code yet, tap ${ui('Reserve supplies', '预约物资')} on ${ui('Status', '进度')}, choose supplies of the same kind and the quantity, and get a pickup code (kept for 48 hours). Or just tell me which request to reserve for.`,
  '导航到服务点：在首页“附近服务”里点一个服务点，或在“地图”页选中服务点后点“在微信地图中导航”。也可以直接告诉我去哪个服务点，我帮您打开导航。':
    () => `To get directions to a service point: tap a point under ${ui('Nearby Services', '附近服务')} on ${ui('Home', '首页')}, or select one on ${ui('Map', '地图')} and tap ${ui('Navigate in WeChat Maps', '在微信地图中导航')}. Or just tell me which point and I'll open directions for you.`
}

// Why an agreed action could not be done.
const REASONS = {
  '只有待审核的申请可以自己取消；已有处理结果的申请如需取消，请拨打社区服务热线。':
    'Only requests still waiting for review can be cancelled here; to cancel one that has already been decided, please call the community hotline.',
  '确认已过期（需要在 5 分钟内确认），请重新告诉我要做什么。': 'That confirmation has expired (it lasts 5 minutes). Please tell me again what you would like to do.',
  '这个申请已经评价过了，每个申请只能评价一次。': 'This request has already been rated; each request can be rated once.',
  '申请还没有完成，完成后才能评价。': 'This request is not complete yet; you can rate it once it is.',
  '申请状态已经变化，无法完成。': "The request's status has changed, so this can't be done.",
  '没有找到这个申请。': "I couldn't find that request.",
  '请稍后再试。': 'Please try again later.',
  '填写的信息不完整或不正确，请重新告诉我。': 'Some details are missing or wrong. Please tell me again.',
  '申请状态刚刚发生了变化，请稍后再试。': 'The request just changed. Please try again in a moment.'
}

const FLOW = [
  'How it works:',
  '① On the "Get Help" tab, choose the supplies and quantity, set your location, and choose pickup at a service point or supply cart delivery;',
  '② Staff review every request. Once approved, the supplies are reserved at the nearest service point that has them and you get a 6-digit pickup code (kept for 48 hours). If a request is declined, the "Status" tab says why;',
  '③ Pickup: show your code at that service point during opening hours. Delivery: the nearest supply cart collects the supplies and brings them to you; follow it and its arrival time on the "Status" tab;',
  '④ For items we don\'t stock, choose "Other" and staff will handle it. Afterwards you can leave feedback on the "Status" tab. All supplies are free.'
].join('\n')

const STATUS = {
  '已提交，等待审核': 'submitted, waiting for review', '审核中': 'under review', '已批准，可以预约物资': 'approved',
  '已安排，等待领取或配送': 'arranged, waiting for pickup or delivery', '已完成': 'completed', '未通过': 'declined', '已取消': 'cancelled'
}
const RESERVATION_STATUS = { '待领取': 'to collect', '已领取': 'collected', '已过期': 'expired', '已取消': 'cancelled' }
const NOTICES = {
  '需求已收到': 'Request received', '需求审核中': 'Request under review', '需求已批准，可预约物资': 'Request approved',
  '需求已安排': 'Request scheduled', '需求已完成': 'Request completed', '需求未通过': 'Request declined',
  '需求已取消': 'Request cancelled', '申请进度更新': 'Request status updated', '预约成功': 'Reservation confirmed',
  '支付已完成': 'Payment complete', '退款已完成': 'Refund complete', '服务路线已生成': 'Service route ready', '服务更新': 'Service update'
}
const URGENCY = { '不紧急': 'not urgent', '一般': 'normal', '较紧急': 'urgent', '非常紧急': 'very urgent' }
const PAGES = {
  '首页': 'Home', '地图': 'Map', '求助': 'Get Help', '进度': 'Status', '我的': 'Me', '我的领取码': 'My Pickup Codes',
  '服务通知': 'Service Updates', '填写我的位置': 'My Location', '服务反馈': 'Service Feedback'
}

// Combine a localized product label with the compact stock quantity returned by the backend.
function stockAmount(text) {
  const m = /^(\d+)(\D*)$/.exec(text.trim())
  return m ? amount(m[1], m[2]) : text
}

// Convert a Chinese month-and-day timestamp to its English display form.
function when(text) {
  const m = /^(\d{1,2})月(\d{1,2})日 (\d{2}:\d{2})$/.exec(text)
  return m ? `${monthDay(m[1], m[2])}, ${m[3]}` : text
}

function km(value) { return `about ${value} km` }

// Parse the backend's request summary into fields that can be localized independently.
function requestLine(text) {
  const m = /^申请 #(\d+)：(.+)，数量 (\d+)，当前状态：(.+?)。(.*)$/.exec(text)
  if (!m) return translate(text)
  let rest = m[5]
  let method = ''
  const how = /领取方式：(到点自取|补给车配送)(?:（(.+?)）)?。$/.exec(rest)
  if (how) {
    rest = rest.slice(0, how.index)
    method = ` ${how[1] === '到点自取' ? 'Pickup' : 'Cart delivery'}${how[2] ? ` (${term(how[2])})` : ''}.`
  }
  // What is left is the decision note, one or more sentences the backend wrote.
  const note = (rest.match(/[^。]+。?/g) || []).map(sentence => translate(sentence.trim())).join(' ')
  return `Request #${m[1]}: ${translate(m[2])}, qty ${m[3]}, ${STATUS[m[4]] || m[4]}.${note ? ` ${note}` : ''}${method}`
}

function reservationLine(text) {
  const m = /^申请 #(\d+)：(.+) × (\d+)，(\S+?)(?:，领取码 (\d+)，有效期至 (\d{1,2})月(\d{1,2})日 (\d{2}:\d{2})，物资来自 (.+))?$/.exec(text)
  if (!m) return translate(text)
  const code = m[5] ? `, pickup code ${m[5]}, valid until ${monthDay(m[6], m[7])} ${m[8]}, from ${term(m[9])}` : ''
  return `Request #${m[1]}: ${term(m[2])} × ${m[3]}, ${RESERVATION_STATUS[m[4]] || m[4]}${code}`
}

function stockLine(text) {
  const m = /^(.+?)：(.+)$/.exec(text)
  if (!m) return translate(text)
  const points = m[2].split('、').map(part => {
    const p = /^(.+?)（(.+)）$/.exec(part)
    return p ? `${stockAmount(p[1])} at ${term(p[2])}` : part
  })
  return `${term(m[1])}: ${points.join(', ')}`
}

// Parse a service-point summary into its name, address, distance, and opening-hours fields.
function pointLine(text) {
  const m = /^(.+?)：(.+?)(?:，约 ([\d.]+) 公里)?(?:，营业时间 (\S+))?$/.exec(text)
  if (!m) return translate(text)
  return `${term(m[1])}: ${translate(m[2])}${m[3] ? `, ${km(m[3])}` : ''}${m[4] ? `, open ${m[4]}` : ''}`
}

// Parse a dated notification and its optional request reference.
function noticeLine(text) {
  const m = /^(\d{1,2})月(\d{1,2})日 (\d{2}:\d{2}) (.+?)(?:（申请 #(\d+)）)?$/.exec(text)
  if (!m) return translate(text)
  return `${monthDay(m[1], m[2])} ${m[3]} ${NOTICES[m[4]] || translate(m[4])}${m[5] ? ` (request #${m[5]})` : ''}`
}

// Parse an address-search result and its distance from the nearest service point.
function foundPlace(text) {
  const m = /^(.+?)：(.+)，离最近的服务点约 ([\d.]+) 公里$/.exec(text)
  return m ? `${translate(m[1])}: ${translate(m[2])}, ${km(m[3])} from the nearest service point` : translate(text)
}

const LISTS = [
  ['当前可免费领取：', 'Free to collect now:', stockLine,
    { '请在“求助”页提交需求；工作人员审核批准后，会锁定库存并发放领取码。': 'Tell me what you need and I can request it for you, or use the "Get Help" tab. Once staff approve it, the supplies are reserved and you get a pickup code.' }],
  ['您最近的申请：', 'Your recent requests:', requestLine,
    { '可在“进度”页查看详情；已批准的申请可以预约物资。': 'See the "Status" tab for details.' }],
  ['您最近的预约：', 'Your recent bookings:', reservationLine,
    { '领取或配送送达时，请出示领取码。': 'Show your pickup code when you collect or when the delivery arrives.' }],
  ['当前公益服务点：', 'Service points:', pointLine,
    { '可在首页地图查看位置并导航；选择“到点自取”时请在营业时间内前往。': 'I can open navigation to any of them for you. For pickup, please come during opening hours.' }],
  ['离您最近的服务点：', 'Service points nearest you:', pointLine,
    { '可在首页地图查看位置并导航；选择“到点自取”时请在营业时间内前往。': 'I can open navigation to any of them for you. For pickup, please come during opening hours.' }],
  ['您最近的通知：', 'Your recent updates:', noticeLine,
    { '也可以在“我的”→“进度通知”查看。': 'You can also see them under Me → Status Updates.' }]
]

// Parse a pending request summary so each field can be rendered in the active language.
function summaryText(text) {
  let m = /^提交“(.+)”需求，数量 (\d+)，(到服务点自取|补给车配送)，(.+?)，紧急程度：(.+?)。(.+)$/.exec(text)
  if (m) {
    const slot = m[4] === '尽快' ? 'as soon as possible'
      : (/^(\d{1,2})月(\d{1,2})日 (\S+)$/.exec(m[4]) || []).length ? m[4].replace(/^(\d{1,2})月(\d{1,2})日 (\S+)$/, (_, mo, d, t) => `${monthDay(mo, d)}, ${t}`) : m[4]
    const after = m[6].indexOf('库存中没有') === 0 ? 'This item is not in stock, so staff will review it and contact you.'
      : 'Staff will review it and, once approved, issue a pickup code.'
    return `request ${translate(m[1])}, quantity ${m[2]}, ${m[3] === '到服务点自取' ? 'pickup at a service point' : 'supply cart delivery'}, ${slot}, urgency: ${URGENCY[m[5]] || m[5]}. ${after}`
  }
  m = /^取消申请 #(\d+)：(.+) × (\d+)$/.exec(text)
  if (m) return `cancel request #${m[1]}: ${translate(m[2])} × ${m[3]}`
  m = /^为申请 #(\d+) 预约 (.+?)（(.+)），数量 (\d+)$/.exec(text)
  if (m) return `reserve ${term(m[2])} (${term(m[3])}) for request #${m[1]}, quantity ${m[4]}`
  m = /^为申请 #(\d+) 提交服务反馈：(\d) 星(?:，以前获取同类物资约 (\d+) 分钟)?(?:，这次约 (\d+) 分钟)?(?:，意见：(.+))?$/.exec(text)
  if (m) {
    return `rate request #${m[1]} ${m[2]} star${m[2] === '1' ? '' : 's'}${m[3] ? `, ${m[3]} minutes before` : ''}${m[4] ? `, ${m[4]} minutes this time` : ''}${m[5] ? `, comment: ${m[5]}` : ''}`
  }
  m = /^把资料改为：称呼“(.+)”，家庭人数 (\d+) 人$/.exec(text)
  if (m) return `change your profile to: name "${translate(m[1])}", ${m[2]} ${m[2] === '1' ? 'person' : 'people'} in your household`
  m = /^把您的位置设为“(.+)”（(.+)），离最近的服务点约 ([\d.]+) 公里$/.exec(text)
  if (m) return `set your location to "${translate(m[1])}" (${translate(m[2])}), ${km(m[3])} from the nearest service point`
  return translate(text)
}

// One block of the reply, in English.
function blockText(trimmed) {
  if (FIXED[trimmed]) return FIXED[trimmed]
  if (GUIDES[trimmed]) return GUIDES[trimmed]()
  if (trimmed.indexOf('使用流程：') === 0) return FLOW
  let m = /^目前没有名称包含“(.+)”的物资。/.exec(trimmed)
  if (m) return `Nothing in stock is called "${translate(m[1])}". Ask "What supplies are available?" to see everything, or tell me what you need and I can request it for you.`
  m = /^(.+) 目前已全部被预约，暂时无法领取；/.exec(trimmed)
  if (m) return `${m[1].split('、').map(term).join(', ')}: all reserved right now, so none can be collected. You can still request it and we will follow up.`
  m = /^未找到属于您的申请 #(\d+)，/.exec(trimmed)
  if (m) return `You have no request #${m[1]}. Please check the number and try again.`
  m = /^已提交申请 #(\d+)。(.*)$/.exec(trimmed)
  if (m) return `Request #${m[1]} submitted. ${translate(m[2])}`.trim()
  m = /^已取消申请 #(\d+)。$/.exec(trimmed)
  if (m) return `Request #${m[1]} cancelled.`
  m = /^已预约 (.+) × (\d+)，领取码 (\d+)，有效期至 (.+?)。/.exec(trimmed)
  if (m) return `Reserved ${term(m[1])} × ${m[2]}. Pickup code ${m[3]}, valid until ${when(m[4])}. Show it when you collect or when the delivery arrives.`
  m = /^已提交申请 #(\d+) 的服务反馈（(\d) 星），谢谢！$/.exec(trimmed)
  if (m) return `Feedback for request #${m[1]} submitted (${m[2]} star${m[2] === '1' ? '' : 's'}). Thank you!`
  m = /^已更新资料：称呼“(.+)”，家庭人数 (\d+) 人。$/.exec(trimmed)
  if (m) return `Profile updated: name "${translate(m[1])}", ${m[2]} ${m[2] === '1' ? 'person' : 'people'} in your household.`
  m = /^已把您的位置设为“(.+?)”(?:（(.+)）)?。$/.exec(trimmed)
  if (m) return `Your location is now "${translate(m[1])}"${m[2] ? ` (${foundPlace(m[2])})` : ''}.`
  m = /^没能完成这项操作：(.+)$/.exec(trimmed)
  if (m) return `I couldn't do that: ${REASONS[m[1]] || translate(m[1])}`
  m = /^请确认：(.+)。回复“确认”就会执行，回复“不要”则放弃。$/.exec(trimmed)
  if (m) return `Please confirm: ${summaryText(m[1])}. Reply "yes" to go ahead, or "no" to drop it.`
  m = /^正在拨打社区服务热线 (\S+)。$/.exec(trimmed)
  if (m) return `Calling the community hotline ${m[1]}.`
  m = /^正在打开微信地图，导航到(.+?)（(.+)）。$/.exec(trimmed)
  if (m) return `Opening WeChat Maps with directions to ${term(m[1])} (${translate(m[2])}).`
  m = /^正在打开“(.+)”页。$/.exec(trimmed)
  if (m) return `Opening ${PAGES[m[1]] || m[1]}.`
  m = /^没有找到“(.+)”这个地址。/.exec(trimmed)
  if (m) return `I couldn't find "${m[1]}". Try just the name of your estate, or the road and building number.`
  m = /^没有找到名称或地址包含“(.+)”的服务点。/.exec(trimmed)
  if (m) return `No service point has "${m[1]}" in its name or address. Ask "What service points are there in Qingpu?" to see them all.`
  if (trimmed.indexOf('库存里有几种“') === 0) {
    const rows = trimmed.split('\n')
    const asked = (/^库存里有几种“(.+)”：$/.exec(rows[0]) || [])[1] || ''
    const head = !asked || HAN.test(asked) ? 'We have several kinds of that:' : `We have several kinds of "${asked}":`
    return [head].concat(rows.slice(1).filter(row => /^\d+\. /.test(row)).map(row => {
      const p = /^(\d+)\. (.+)$/.exec(row)
      return `${p[1]}. ${term(p[2])}`
    }), ['Which one would you like? (You can say "the first one", "the second one"…)']).join('\n')
  }
  if (trimmed.indexOf('找到这几个地点，请告诉我是第几个：') === 0) {
    return ['I found these places. Which one is it? Tell me the number:'].concat(trimmed.split('\n').slice(1).map(row => {
      const p = /^(\d+)\. (.+)$/.exec(row.trim())
      return p ? `${p[1]}. ${foundPlace(p[2])}` : translate(row)
    })).join('\n')
  }
  m = /^您的资料：称呼“(.+)”，家庭人数 (\d+) 人。\n当前位置：(.+)。$/.exec(trimmed)
  if (m) {
    const place = m[3] === '还没有设置' ? 'not set yet'
      : m[3] === '系统分配的默认位置（还没有设置您家的地址）' ? 'the default location assigned to you (your home address is not set yet)'
        : m[3] === '已设置' ? 'set' : translate(m[3])
    return `Your profile: name "${translate(m[1])}", ${m[2]} ${m[2] === '1' ? 'person' : 'people'} in your household.\nYour location: ${place}.`
  }
  m = /^申请 #(\d+) 是到点自取，没有配送车辆(?:，请到(.+)出示领取码领取)?。$/.exec(trimmed)
  if (m) return `Request #${m[1]} is for pickup, so no cart is involved.${m[2] ? ` Collect it at ${term(m[2])} by showing your pickup code.` : ''}`
  m = /^申请 #(\d+) (还在等待审核，批准后系统才会安排补给车|已批准，补给车还没有出发，系统会自动安排|已经送达，本次服务已完成|未通过，不会配送|已取消，不会配送)。$/.exec(trimmed)
  if (m) {
    const state = {
      '还在等待审核，批准后系统才会安排补给车': 'is still waiting for review; a supply cart is arranged once it is approved',
      '已批准，补给车还没有出发，系统会自动安排': 'is approved; the supply cart has not set off yet and will be arranged automatically',
      '已经送达，本次服务已完成': 'has been delivered and is complete',
      '未通过，不会配送': 'was declined, so nothing will be delivered',
      '已取消，不会配送': 'was cancelled, so nothing will be delivered'
    }[m[2]]
    return `Request #${m[1]} ${state}.`
  }
  m = /^申请 #(\d+) 的物资已由(.+)送达。$/.exec(trimmed)
  if (m) return `The supplies for request #${m[1]} were delivered by ${term(m[2])}.`
  m = /^申请 #(\d+)：(.+?)，(.+?)(?:，预计 (\d{2}:\d{2}) 送达)?。可在地图页查看车辆位置。$/.exec(trimmed)
  if (m) return `Request #${m[1]}: ${term(m[2])}, ${translate(m[3])}${m[4] ? `, arriving around ${m[4]}` : ''}. You can follow it on the Map tab.`
  if (/^申请 #\d+：/.test(trimmed)) return requestLine(trimmed)
  for (const [head, english, line, tails] of LISTS) {
    if (trimmed.indexOf(head) !== 0) continue
    return [english].concat(trimmed.slice(head.length).split('\n').map(row => row.trim()).filter(Boolean).map(row => {
      if (row.indexOf('• ') === 0) return `• ${line(row.slice(2))}`
      return tails[row] || translate(row)
    })).join('\n')
  }
  return translate(trimmed)
}

// Localize a composed assistant reply one paragraph at a time because each paragraph may represent
// a different tool result or availability statement.
function replyText(text) {
  if (!isEn() || !text || typeof text !== 'string') return text
  return text.trim().split(/\n\s*\n/).map(block => englishNames(blockText(block.trim()))).join('\n\n')
}

// Match longer product names first to prevent a shorter embedded name from consuming the input.
const NAME_KEYS = Object.keys(ITEMS).sort((a, b) => b.length - a.length)

// Stock and service point names left in Chinese inside an English reply (the model is asked to keep
// them as they are), in the English names the rest of the app uses.
function englishNames(text) {
  if (!isEn() || !text || typeof text !== 'string') return text
  let out = text
  NAME_KEYS.forEach(zh => { if (out.indexOf(zh) >= 0) out = out.split(zh).join(ITEMS[zh]) })
  return out.replace(/邻需通·[^，。,.\s“”"（）()]+?服务点/g, point => term(point))
}

module.exports = { lookupFor, replyText, englishNames, messageLanguage }
