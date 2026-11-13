const { categoryName } = require('./display')
const { L, isEn } = require('./i18n')
const { term, amount, place } = require('./translate')

// Derive the district label from a full service-point name.
function shortPointName(name) {
  return place(String(name || '').replace(/^邻需通·/, '').replace(/公益服务点$/, '').replace(/服务点$/, '') || name)
}

function productKey(item) {
  return `${item.name}|${item.unit}|${item.category}`
}

// The same product is stocked at several service points. Residents see it once, with how much
// each point holds; requests carry the id of the best-stocked item and the backend reserves the
// same product at the point nearest to the resident.
function productsFrom(inventory, paymentsEnabled) {
  const byKey = {}
  inventory.filter(item => paymentsEnabled || item.unitPriceFen === 0).forEach(item => {
    const key = productKey(item)
    const product = byKey[key] || (byKey[key] = {
      // name is shown; sourceName is the backend's own (Chinese) name, which requests carry.
      key, name: term(item.name), sourceName: item.name, unit: item.unit, category: item.category, categoryName: categoryName(item.category),
      initial: item.initial || '#',
      itemId: item.id, maxFree: -1, totalFree: 0, points: []
    })
    const free = Math.max(0, item.freeQuantity)
    product.totalFree += free
    product.points.push({ name: shortPointName(item.servicePointName), free })
    if (free > product.maxFree) { product.maxFree = free; product.itemId = item.id }
  })
  // The backend returns inventory in pinyin order; products keep the order of first appearance.
  return Object.keys(byKey).map(key => byKey[key])
    .map(product => ({
      ...product,
      points: product.points.map(point => ({ ...point, freeText: amount(point.free, product.unit) })),
      pointsText: product.points.map(point => `${point.name} ${amount(point.free, product.unit)}`).join(' · '),
      label: product.maxFree > 0
        ? L(`${product.name}（${product.categoryName}，单点最多可领 ${product.maxFree}${product.unit}）`,
          `${product.name} (${product.categoryName}, up to ${amount(product.maxFree, product.unit)} at one point)`)
        : L(`${product.name}（暂无库存）`, `${product.name} (out of stock)`)
    }))
}

// Products grouped under their initial (A–Z, then "#"), keeping each product's list index. In
// Chinese that is the pinyin initial from the backend, in its order; in English it is the first
// letter of the English name, sorted by that name.
function letterGroups(products) {
  const groups = []
  const byLetter = {}
  products.forEach((product, index) => {
    const initial = isEn() ? product.name.charAt(0).toUpperCase() : product.initial
    const letter = /^[A-Z]$/.test(initial) ? initial : '#'
    if (!byLetter[letter]) { byLetter[letter] = { letter, items: [] }; groups.push(byLetter[letter]) }
    byLetter[letter].items.push({ ...product, index })
  })
  if (isEn()) groups.forEach(group => group.items.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })))
  return groups.sort((a, b) => (a.letter === '#') - (b.letter === '#') || a.letter.localeCompare(b.letter))
}

module.exports = { productsFrom, productKey, shortPointName, letterGroups }
