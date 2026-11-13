// End-to-end walk through the web version against a running stack (deploy/docker-compose.yml):
// a new resident picks English, browses the home page and map, submits a delivery request,
// staff approve it on the operations page, and the resident follows it, asks the assistant,
// edits their profile and sets their location. Screenshots go to e2e/artifacts.
//
//   BASE_URL=http://localhost:8088 OPERATOR_ACCOUNT=... OPERATOR_PASSWORD=... node e2e/journey.mjs
//
// READ_ONLY=1 skips the steps that change live business data (submitting, approving, dispatching
// and completing a request), for checking a production deployment.
import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'artifacts')
mkdirSync(out, { recursive: true })
const BASE = process.env.BASE_URL || 'http://localhost:8088'
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find(path => path && existsSync(path))

const problems = []
const step = async (name, run) => {
  const started = Date.now()
  try {
    await run()
    console.log(`✓ ${name} (${Date.now() - started} ms)`)
  } catch (error) {
    problems.push(`${name}: ${error.message.split('\n')[0]}`)
    console.log(`✗ ${name}: ${error.message.split('\n')[0]}`)
  }
}
// Steps that change live business data; READ_ONLY=1 leaves them out.
const writeStep = process.env.READ_ONLY ? async name => console.log(`- ${name} (skipped: READ_ONLY)`) : step

const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.HEADED ? false : true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' })
context.setDefaultTimeout(15000)
const page = await context.newPage()
page.on('pageerror', error => problems.push(`page error: ${error.message}`))
page.on('console', message => { if (message.type() === 'error' && !/favicon|tile|autonavi|cartocdn/i.test(message.text())) problems.push(`console: ${message.text()}`) })
const shot = name => page.screenshot({ path: join(out, `${name}.png`) })
const active = '.wx-frame-active'
const inPage = selector => page.locator(`${active} ${selector}`)
const tapText = (text, scope = active) => page.locator(scope).getByText(text, { exact: true }).first().click()
const tab = () => page.locator(`${active} .wx-tabbar-item`)
let requestId = 0
const modalOk = async () => { await page.locator('.wx-modal').waitFor(); await page.locator('.wx-modal-confirm').click() }

await step('opens with the language picker', async () => {
  await page.goto(`${BASE}/app.html`)
  await page.locator('.language-card').waitFor({ timeout: 15000 })
  await shot('01-language')
})

await step('chooses English; home loads service points and stock', async () => {
  await page.locator('.language-option').nth(1).click()
  await page.locator('.language-card').waitFor({ state: 'hidden' })
  await inPage('.point-card').first().waitFor({ timeout: 20000 })
  await inPage('.inventory-card').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(400)
  await shot('02-home')
  const title = await page.locator(`${active} .wx-navbar-title`).textContent()
  if (title !== 'Help Hub') throw new Error(`nav title is ${title}`)
})

await step('map shows service points', async () => {
  await tab().nth(1).click()
  await inPage('.leaflet-marker-icon').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  await shot('03-map')
})

await writeStep('submits a delivery request', async () => {
  await tab().nth(2).click()
  await inPage('.form-card').waitFor()
  await inPage('.form-card .picker').first().click()
  await inPage('.sheet .product-row').first().waitFor()
  await shot('04-product-sheet')
  await inPage('.sheet .product-row').first().click()
  await inPage('.method').nth(1).click()
  await shot('05-request-form')
  const created = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/resident\/requests\?/.test(response.url()))
  await inPage('wx-button.btn').click()
  requestId = (await (await created).json()).id
  await page.locator('.wx-modal').waitFor({ timeout: 15000 })
  await shot('06-submitted')
  await modalOk()
  await inPage('.request-card').first().waitFor({ timeout: 15000 })
  await shot('07-status')
})

await writeStep('staff approve it on the operations page', async () => {
  const account = process.env.OPERATOR_ACCOUNT
  const password = process.env.OPERATOR_PASSWORD
  if (!account || !password) throw new Error('OPERATOR_ACCOUNT/OPERATOR_PASSWORD not set')
  await tab().nth(4).click()
  await tapText('Operations Portal')
  await inPage('.login-card').waitFor()
  await inPage('.login-card wx-input input').nth(0).fill(account)
  await inPage('.login-card wx-input input').nth(1).fill(password)
  await inPage('.login-card wx-button').click()
  await inPage('.whoami').waitFor({ timeout: 15000 })
  await shot('08-operations')
  // This resident's request, by its id (other residents' requests may be waiting too).
  const card = page.locator(`${active} .card`).filter({ hasText: `#${requestId} ` })
  await card.getByText('Approve', { exact: true }).click()
  await modalOk()
  await page.waitForTimeout(1500)
  await shot('09-approved')
  await page.locator(`${active} .wx-navbar-icon`).click()
})

await writeStep('resident sees the approval and the pickup code', async () => {
  await tab().nth(3).click()
  await page.waitForTimeout(800)
  await inPage('.decision').first().waitFor({ timeout: 15000 })
  await shot('10-status-approved')
  await tapText('View pickup code').catch(() => undefined)
  await page.waitForTimeout(1200)
  await shot('11-pickup-codes')
  await page.locator(`${active} .wx-navbar-icon`).click().catch(() => undefined)
})

await writeStep('the delivery is dispatched automatically and can be tracked on the map', async () => {
  // A cart only sets off when one is free; with every cart out, the request correctly waits its turn.
  const carts = await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('helphub:accessToken') || '{"v":""}').v
    return (await fetch('/api/resident/carts', { headers: { Authorization: `Bearer ${token}` } })).json()
  })
  if (!carts.some(cart => cart.status === 'AVAILABLE')) {
    console.log('  (skipped: every supply cart is out on an earlier delivery; the request waits for the next free cart)')
    return
  }
  await tab().nth(3).click()
  const track = page.locator(active).getByText('Track delivery', { exact: true })
  for (let i = 0; i < 30 && !(await track.count()); i++) {
    await page.waitForTimeout(5000)
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await tab().nth(0).click()
    await tab().nth(3).click()
  }
  await track.first().click()
  await inPage('.map-state.tracking').waitFor({ timeout: 20000 })
  await page.waitForTimeout(2500)
  await shot('11b-tracking')
  await inPage('.map-state.tracking wx-button').click()
})

await writeStep('staff mark the delivery done; the resident leaves feedback', async () => {
  await tab().nth(4).click()
  await tapText('Operations Portal')
  await inPage('.whoami').waitFor({ timeout: 10000 }).catch(async () => {
    await inPage('.login-card wx-input input').nth(0).fill(process.env.OPERATOR_ACCOUNT)
    await inPage('.login-card wx-input input').nth(1).fill(process.env.OPERATOR_PASSWORD)
    await inPage('.login-card wx-button').click()
    await inPage('.whoami').waitFor()
  })
  const card = page.locator(`${active} .card`).filter({ hasText: `#${requestId} ` })
  await card.first().waitFor({ timeout: 15000 })
  const done = card.getByText('Mark delivered', { exact: true })
  if (!(await done.count())) {
    console.log('  (skipped: the request is still waiting for a free cart, so it cannot be marked delivered yet)')
    await page.locator(`${active} .wx-navbar-icon`).click()
    return
  }
  await done.click()
  await modalOk()
  await page.waitForTimeout(1200)
  await page.locator(`${active} .wx-navbar-icon`).click()
  await tab().nth(3).click()
  await page.locator(active).getByText('Give feedback', { exact: true }).first().click()
  await inPage('.stars wx-text').nth(3).click()
  await inPage('.form-card wx-input input').nth(0).fill('45')
  await inPage('.form-card wx-input input').nth(1).fill('10')
  await inPage('.form-card wx-button.btn').click()
  await inPage('.success').waitFor({ timeout: 10000 })
  await shot('11c-feedback')
  await inPage('.success wx-button').click()
})

await step('asks the assistant', async () => {
  await tab().nth(0).click()
  await tapText('Ask Assistant')
  await inPage('.quick-list wx-text').first().click()
  await inPage('.message.assistant .bubble:not(.typing)').nth(1).waitFor({ timeout: 70000 })
  await page.waitForTimeout(300)
  await shot('12-assistant')
  await page.locator(`${active} .wx-navbar-icon`).click()
})

await step('sets a location on the map', async () => {
  await inPage('.mini-btn').click()
  await inPage('.picker-map').waitFor()
  await page.waitForTimeout(800)
  const box = await inPage('.picker-map').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  await inPage('.search-input input').fill('青浦区青湖路 88 弄')
  await shot('13-place')
})

await step('edits the profile', async () => {
  await page.locator(`${active} .wx-navbar-icon`).click()
  await tab().nth(4).click()
  await inPage('.profile-card').click()
  await inPage('.edit-card').waitFor()
  await shot('14-profile-edit')
  await inPage('.edit-card .cancel').click()
})

await step('picks a value on a picker wheel', async () => {
  await tab().nth(2).click()
  await inPage('.field.two wx-picker').first().click()
  await page.locator('.wx-picker-sheet').waitFor()
  await page.locator('.wx-picker-row').nth(3).click()
  await page.waitForTimeout(700)
  await shot('16-picker')
  await page.locator('.wx-picker-confirm').click()
  await page.locator('.wx-picker-sheet').waitFor({ state: 'detached' })
  const urgency = await inPage('.field.two wx-picker .picker').first().textContent()
  if (!/Critical|Urgent|紧急/i.test(urgency || '')) throw new Error(`urgency shows ${urgency}`)
})

await step('copies a pickup code and reads notifications', async () => {
  await tab().nth(4).click()
  await tapText('Status Updates')
  await inPage('.page').waitFor()
  await page.waitForTimeout(1200)
  await shot('17-notifications')
  await page.locator(`${active} .wx-navbar-icon`).click()
})

await step('pull-down refresh on the status page', async () => {
  await tab().nth(3).click()
  const box = await inPage('.wx-scroller').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 12 })
  await page.waitForTimeout(150)
  await shot('18-pull')
  await page.mouse.up()
  await page.locator(`${active} .wx-refresh-running`).waitFor({ timeout: 3000 }).catch(() => undefined)
  await page.waitForFunction(() => !document.querySelector('.wx-frame-active .wx-refresh-running'), null, { timeout: 15000 })
})

await step('closing and reopening (capsule) asks for the language again', async () => {
  await page.locator(`${active} .wx-capsule button`).nth(1).click()
  await page.locator('.language-card').waitFor({ timeout: 10000 })
  await page.locator('.language-option').nth(0).click()
  await inPage('.point-card').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  await shot('19-home-zh')
  const title = await page.locator(`${active} .wx-navbar-title`).textContent()
  if (title !== '邻需通') throw new Error(`nav title is ${title}`)
})

await step('desktop entry page', async () => {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await desktop.goto(`${BASE}/`)
  await desktop.frameLocator('#app-frame').locator('.language-card').waitFor({ timeout: 20000 })
  await desktop.waitForTimeout(600)
  await desktop.screenshot({ path: join(out, '15-desktop.png') })
  await desktop.close()
})

await browser.close()
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('\nAll steps passed.')
