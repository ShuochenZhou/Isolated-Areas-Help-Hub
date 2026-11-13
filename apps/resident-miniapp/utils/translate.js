// English for the Chinese the backend sends: stock, service points, carts, the notes residents
// write, and the sentences it composes (decision notes, cart status, courier legs). The backend
// stays Chinese; in Chinese mode every function here returns its input unchanged. Text that is
// not recognised (for example something a resident typed freely) is shown as it is.
const { isEn } = require('./i18n')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HAN = /[一-鿿]/

const ITEMS = {
  '公益大米 5 千克': 'Rice, 5 kg',
  '公益面粉 5 千克': 'Flour, 5 kg',
  '公益挂面 1 千克': 'Dried Noodles, 1 kg',
  '公益燕麦片 1 千克': 'Rolled Oats, 1 kg',
  '公益食用油 1 升': 'Cooking Oil, 1 L',
  '公益食盐 400 克': 'Salt, 400 g',
  '公益酱油 500 毫升': 'Soy Sauce, 500 ml',
  '公益午餐肉罐头 340 克': 'Canned Luncheon Meat, 340 g',
  '公益苏打饼干 1 千克': 'Soda Crackers, 1 kg',
  '公益方便面 5 连包': 'Instant Noodles, 5-pack',
  '公益纯牛奶 250 毫升×12 盒': 'Milk, 12 × 250 ml',
  '常温食品综合包': 'Shelf-Stable Food Pack',
  '公益饮用水 12 瓶装': 'Drinking Water, 12 bottles',
  '公益饮用水 550 毫升×24 瓶': 'Drinking Water, 24 × 550 ml',
  '公益基础卫生用品包': 'Basic Hygiene Kit',
  '婴幼儿基础护理包': 'Baby Care Kit',
  '成人纸尿裤 L 码': 'Adult Diapers, Size L',
  '婴儿纸尿裤 M 码': 'Baby Diapers, Size M',
  '卫生巾日夜组合装': 'Sanitary Pads, Day & Night',
  '牙膏牙刷套装': 'Toothpaste & Toothbrush Set',
  '香皂 3 块装': 'Bar Soap, 3-pack',
  '抽纸 10 包公益装': 'Facial Tissues, 10 packs',
  '洗衣液 2 千克': 'Laundry Detergent, 2 kg',
  '基础医疗用品包': 'Basic Medical Kit',
  '基础急救用品包': 'Basic First Aid Kit',
  '医用外科口罩 50 只': 'Surgical Masks, 50 pcs',
  '酒精消毒液 75% 500 毫升': '75% Alcohol Disinfectant, 500 ml',
  '电子体温计': 'Digital Thermometer',
  '公益应急生活包': 'Emergency Living Kit',
  '应急手电筒与电池包': 'Emergency Flashlight & Batteries',
  '应急蜡烛与打火机套装': 'Emergency Candles & Lighter',
  '保暖毯': 'Warm Blanket',
  '一次性雨衣': 'Disposable Raincoat'
}

const UNITS = {
  '袋': ['bag', 'bags'], '箱': ['case', 'cases'], '包': ['pack', 'packs'], '条': ['piece', 'pieces'],
  '套': ['set', 'sets'], '罐': ['can', 'cans'], '瓶': ['bottle', 'bottles'], '盒': ['box', 'boxes'],
  '提': ['bundle', 'bundles'], '支': ['unit', 'units'], '件': ['piece', 'pieces'], '组': ['set', 'sets'],
  '只': ['piece', 'pieces'], '个': ['unit', 'units'], '份': ['portion', 'portions'], '床': ['piece', 'pieces']
}

// Localize district names, compact service-point labels, and road names used in addresses.
const PLACES = { '夏阳': 'Xiayang', '青浦工业园区': 'Qingpu Industrial Park' }
const SHORT_PLACES = { '夏阳': 'Xiayang', '青浦工业园区': 'Industrial Park' }
const ROADS = { '青松路': 'Qingsong Rd', '清河湾路': 'Qinghewan Rd' }

const PEOPLE = {
  '社区居民': 'Resident', '邻需通运营管理员': 'Help Hub Administrator', '自动调度系统': 'Auto-Dispatch'
}

// Request notes shown by the client, including needs outside the current stock catalog.
const PHRASES = {
  '家中有老人，尽量上午送达': 'An elderly person lives with me; morning delivery if possible',
  '家里有小孩，麻烦尽快安排': 'I have small children at home; please arrange this soon',
  '最近身体不太方便出门': "I haven't been well enough to go out lately",
  '家中存量快用完了，先领一些应急': "We're almost out at home; this will tide us over",
  '和邻居合用，数量按两家估算': "Shared with a neighbour, so it's enough for two households",
  '下班后才能处理，请按预约时段安排': 'I can only deal with it after work; please keep to the booked time',
  '家里刚搬来，日常用品还没备齐': "Just moved in and don't have the basics yet",
  '最近附近超市缺货，先在这里领一些': "The nearby supermarket has been out of stock, so I'm getting some here",
  '家中有孕妇，请帮忙留意': 'Someone at home is pregnant; please take care',
  '平时一个人住，领完自己分装': "I live alone and will portion it out myself",
  '行动不便，请提前电话联系': 'Limited mobility; please call ahead',
  '住在高层且电梯检修，请送到楼下': 'I live on a high floor and the lift is under repair; please leave it downstairs',
  '白天可能在午休，到了请敲门': 'I may be napping at midday; please knock when you arrive',
  '听力不太好，请多打几次电话': "I'm hard of hearing; please call more than once",
  '小区门口有保安，报我的名字即可': "There's a guard at the gate; just give my name",
  '家里有狗，进门前请先打电话': "There's a dog at home; please call before coming in",
  '可以放在门口，放好后发个通知': "You can leave it at the door; please let me know when it's there",
  '到楼下后请电话联系，我下来取': "Call me from downstairs and I'll come down",
  '腿脚不好，请尽量送到家门口': 'I have trouble walking; please bring it to my door if you can',
  '晚上七点前都在家': "I'm home until 7 pm",
  '家中有行动不便的老人，请敲门后稍等': 'An elderly person with limited mobility lives here; please knock and wait a moment',
  '到了请打电话，我下楼拿': "Please call when you arrive and I'll come down",
  '白天家里没人，傍晚后方便': "No one's home during the day; evenings are best",
  '楼道没有电梯，辛苦了': 'No lift in the building, thanks for the climb',
  '请放在门口就好': 'Just leave it at the door, please',
  '从小区东门进来比较近': 'The east gate of the estate is closer',
  '家里有小孩在睡觉，请轻敲门': 'A child may be sleeping; please knock softly',
  '腿脚不方便，麻烦送到楼上': 'I have trouble walking; please bring it upstairs',
  '老人用的助行器': 'A walking frame for an elderly person',
  '电子血压计': 'A digital blood pressure monitor',
  '儿童冬季棉衣': "Children's winter coats",
  '成人纸尿裤': 'Adult diapers',
  '无糖食品，家里有糖尿病老人': 'Sugar-free food for an elderly diabetic at home',
  '手机充电宝': 'A phone power bank',
  '医用口罩一盒': 'A box of medical masks',
  '厚棉被一床': 'A thick quilt',
  '婴儿米粉': 'Baby rice cereal',
  '洗衣液': 'Laundry detergent',
  '取暖用的电热毯': 'An electric blanket',
  '体温计': 'A thermometer',
  '上海市青浦区': 'Qingpu District, Shanghai'
}

// Complete sentences the backend writes.
const SENTENCES = {
  '库存中暂无此物资，已转人工处理，工作人员会尽快跟进。': "This item isn't in stock, so your request has been passed to our staff, who will follow up soon.",
  '已收到申请，等待工作人员审核；批准后会锁定库存并发放领取码。': 'Request received. It is waiting for staff review; once approved, your supplies are reserved and you get a pickup code.',
  '你的位置距离最近的服务点超过 10 公里，不在服务范围内，无法提交。请确认地址是否填写正确。': "Your location is more than 10 km from the nearest service point, which is outside our service area, so the request can't be submitted. Please check that your address is correct.",
  '已批准：工作人员会尽快联系你安排物资。': 'Approved: our staff will contact you soon to arrange your supplies.',
  '所选时段内没有既营业又有货的服务点，无法批准。可拒绝并请居民改选时段。': "Can't approve: no service point is both open and stocked during the chosen time. Decline it and ask the resident to choose another time.",
  '所选时段内没有既营业又有货的服务点，已自动拒绝。请改选其他时段，或选择“尽快”后重新提交。': 'Automatically declined: no service point is both open and stocked during the chosen time. Please choose another time, or "As soon as possible", and submit again.',
  '补给车已到达，但该预约已失效，未能交付；请重新提交需求。': 'The supply cart arrived, but this reservation had expired, so nothing could be handed over. Please submit a new request.',
  '领取码超过 48 小时未使用，需求已自动取消，物资已释放给其他居民；如仍需要请重新提交。': 'The pickup code went unused for 48 hours, so the request was cancelled and the supplies were released to other residents. If you still need them, please submit again.',
  '已完成本次配送': 'Trip completed',
  '正在交付物资': 'Handing over supplies',
  '配送途中': 'On the way',
  '配送中': 'Delivering',
  '待命': 'Standing by',
  '出发位置': 'Starting point',
  '当前位置': 'its current location',
  '按地图标记位置': 'At the map marker',
  '本站无需装货': 'Nothing to load here',
  '交付时请居民出示 6 位领取码并在下方核销': 'At handover, ask the resident for their 6-digit code and verify it below',
  '本趟配送结束后回到服务点待命': 'After this trip, return to the service point and stand by',
  '只能处理分配给自己车辆的配送单': 'You can only handle deliveries assigned to your own cart',
  '当前没有待派送的配送需求，系统会自动派车': 'There are no deliveries waiting; carts are dispatched automatically'
}

const CN_DIGITS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 }

function chineseNumber(text) {
  if (text.length === 1) return CN_DIGITS[text]
  if (text[0] === '十') return 10 + (CN_DIGITS[text[1]] || 0)
  return (CN_DIGITS[text[0]] || 0) * 10 + (CN_DIGITS[text[2] || ''] || 0)
}

function monthDay(month, day) { return `${MONTHS[Number(month) - 1]} ${Number(day)}` }

// Convert an embedded Chinese month-and-day date to its English abbreviation.
function dates(text) { return text.replace(/(\d{1,2})月(\d{1,2})日/g, (_, m, d) => monthDay(m, d)) }

function unitName(unit, count) {
  const names = UNITS[unit]
  if (!names) return unit
  return Number(count) === 1 ? names[0] : names[1]
}

// Format a compact count and unit with language-appropriate spacing and pluralization.
function amount(count, unit) {
  if (!isEn()) return `${count}${unit || ''}`
  return unit ? `${count} ${unitName(unit, count)}` : String(count)
}

function place(short) { return isEn() && SHORT_PLACES[short] || short }

// Names of things: stock, points, carts, addresses, people. null when not one of them.
function name(text) {
  if (ITEMS[text]) return ITEMS[text]
  if (PEOPLE[text]) return PEOPLE[text]
  if (PHRASES[text]) return PHRASES[text]
  let m = /^邻需通·(.+?)(?:公益)?服务点$/.exec(text)
  if (m && PLACES[m[1]]) return `Help Hub · ${PLACES[m[1]]} Service Point`
  if (PLACES[text]) return PLACES[text]
  m = /^青浦公益补给车([一二三四五六七八九十]+)号$/.exec(text)
  if (m) return `Qingpu Supply Cart ${chineseNumber(m[1])}`
  m = /^上海市青浦区(.+?路)(\d+)号(附近)?$/.exec(text)
  if (m && ROADS[m[1]]) return `${m[3] ? 'Near ' : ''}${m[2]} ${ROADS[m[1]]}, Qingpu District, Shanghai`
  m = /^申请 #(\d+)$/.exec(text)
  if (m) return `Request #${m[1]}`
  return null
}

function term(text) { return isEn() && text && (name(String(text).trim()) || SENTENCES[String(text).trim()]) || text }

// Format product, package size, multiplier, and unit as one localized quantity label.
function quantity(item, count, unit) { return `${term(item)} × ${amount(count, unit)}` }

const TEMPLATES = [
  [/^库存不足，无法批准：(.+) 目前单个服务点最多可领 (\d+)(.*)。可补货后再批准，或拒绝。$/,
    m => `Can't approve: not enough stock. Any one service point has at most ${amount(m[2], m[3])} of ${m[1] === '该物资' ? 'this item' : term(m[1])} right now. Restock and approve again, or decline.`],
  [/^已批准：请在 营业时间 (\S+) 到(.+)，出示领取码领取（领取码见“我的领取码”）。$/,
    m => `Approved: collect it at ${term(m[2])} during opening hours (${m[1]}) by showing your pickup code (see "My Pickup Codes").`],
  [/^已批准：请在 (\d{1,2})月(\d{1,2})日 (\S+) 到(.+)，出示领取码领取（领取码见“我的领取码”）。$/,
    m => `Approved: collect it at ${term(m[4])} on ${monthDay(m[1], m[2])}, ${m[3]} by showing your pickup code (see "My Pickup Codes").`],
  [/^已批准：物资已在(.+?)锁定，系统正在安排补给车取货配送，出发后可在地图查看车辆位置。$/,
    m => `Approved: your supplies are reserved at ${term(m[1])} and a supply cart is being arranged to collect and deliver them. Once it sets off, you can follow it on the map.`],
  [/^已批准：物资已在(.+?)锁定，补给车将于 (\d{1,2})月(\d{1,2})日 (\S+) 送达，出发后可在地图查看车辆位置。$/,
    m => `Approved: your supplies are reserved at ${term(m[1])} and a supply cart will deliver them on ${monthDay(m[2], m[3])}, ${m[4]}. Once it sets off, you can follow it on the map.`],
  // Earlier requests were decided automatically; their notes still read that way.
  [/^库存不足，已自动拒绝：(.+) 目前单个服务点最多可领 (\d+)(.*)。可减少数量或改选其他物资后重新提交。$/,
    m => `Automatically declined: not enough stock. Any one service point has at most ${amount(m[2], m[3])} of ${m[1] === '该物资' ? 'this item' : term(m[1])} right now. Lower the quantity or choose another item, then submit again.`],
  [/^已自动批准：请在 营业时间 (\S+) 到(.+)，出示领取码领取（领取码见“我的领取码”）。$/,
    m => `Automatically approved: collect it at ${term(m[2])} during opening hours (${m[1]}) by showing your pickup code (see "My Pickup Codes").`],
  [/^已自动批准：请在 (\d{1,2})月(\d{1,2})日 (\S+) 到(.+)，出示领取码领取（领取码见“我的领取码”）。$/,
    m => `Automatically approved: collect it at ${term(m[4])} on ${monthDay(m[1], m[2])}, ${m[3]} by showing your pickup code (see "My Pickup Codes").`],
  [/^已自动批准：物资已在(.+?)锁定，系统正在安排补给车取货配送，出发后可在地图查看车辆位置。$/,
    m => `Automatically approved: your supplies are reserved at ${term(m[1])} and a supply cart is being arranged to collect and deliver them. Once it sets off, you can follow it on the map.`],
  [/^已自动批准：物资已在(.+?)锁定，补给车将于 (\d{1,2})月(\d{1,2})日 (\S+) 送达，出发后可在地图查看车辆位置。$/,
    m => `Automatically approved: your supplies are reserved at ${term(m[1])} and a supply cart will deliver them on ${monthDay(m[2], m[3])}, ${m[4]}. Once it sets off, you can follow it on the map.`],
  [/^(.+)已出发取货，预计 (\d{2}:\d{2}) 送达，可在地图查看车辆位置。$/,
    m => `${term(m[1])} has set off to collect your supplies and should arrive around ${m[2]}. You can follow it on the map.`],
  [/^补给车已于 (\d{2}:\d{2}) 送达，本次服务已完成。$/,
    m => `Delivered by supply cart at ${m[1]}. This request is complete.`],
  [/^工作人员已于 (\S+) 标记送达，本次服务已完成。如未收到物资，请点“申诉”联系我们。$/,
    m => `Staff marked this as delivered at ${m[1]}. This request is complete. If you didn't receive your supplies, tap "Appeal" to contact us.`],
  [/^已于 (\d{1,2})月(\d{1,2})日 (\d{2}:\d{2}) 领取，本次服务已完成。$/,
    m => `Collected on ${monthDay(m[1], m[2])} at ${m[3]}. This request is complete.`],
  // Cart status.
  [/^正在(.+)装货$/, m => `Loading at ${term(m[1])}`],
  [/^前往(.+)取货$/, m => `Heading to ${term(m[1])} to collect`],
  [/^暂无配送任务，车辆停在(.+)$/, m => `No deliveries yet; parked at ${term(m[1])}`],
  // Courier legs and their details.
  [/^取货：(.+)$/, m => `Collect: ${term(m[1])}`],
  [/^返回：(.+)$/, m => `Return: ${term(m[1])}`],
  [/^送达：(.+)$/, m => `Deliver: ${translate(m[1])}`],
  [/^(.+)（第 (\d+) 个申请）$/, m => `${term(m[1])} (request no. ${m[2]})`],
  [/^装车：(.+) × (\d+)(\S*)（送给 (.+)）$/, m => `Load: ${quantity(m[1], m[2], m[3])} (for ${term(m[4])})`],
  [/^居民预约：(.+)$/, m => `Resident's booking: ${dates(m[1]).replace(/^(\w{3} \d+) /, '$1, ')}`],
  [/^备注：(.+)$/, m => `Note: ${translate(m[1])}`],
  [/^(.+) × (\d+)(\S*)$/, m => quantity(m[1], m[2], m[3])],
  [/^返回(.+)$/, m => `Returning to ${term(m[1])}`],
  // A request the request form composed: "product：note".
  [/^([^：]+)：(.+)$/, m => `${term(m[1])}: ${translate(m[2])}`]
]

// Any backend text, in the current language.
function translate(text) {
  if (!isEn() || !text || typeof text !== 'string' || !HAN.test(text)) return text
  const trimmed = text.trim()
  const known = name(trimmed) || SENTENCES[trimmed]
  if (known) return known
  for (const [pattern, render] of TEMPLATES) {
    const m = pattern.exec(trimmed)
    if (m) return render(m)
  }
  return text
}

module.exports = { translate, term, amount, unitName, place, monthDay, MONTHS, ITEMS }
