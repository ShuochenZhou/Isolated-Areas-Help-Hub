// The assistant as a resident sees it in the web version: Chinese interface, questions in English and
// Chinese, replies read off the page. Uses an existing browser profile, so no resident is created.
//   PROFILE=<chrome user data dir> BASE_URL=https://qingpu-help-hub.vercel.app node e2e/assistant-ui-check.mjs
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'https://qingpu-help-hub.vercel.app'
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => path && existsSync(path))
const out = join(dirname(fileURLToPath(import.meta.url)), 'artifacts')
mkdirSync(out, { recursive: true })
const HAN = /[\u4e00-\u9fff]/
let failures = 0

const context = await chromium.launchPersistentContext(process.env.PROFILE, {
  executablePath: CHROME, headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
})
context.setDefaultTimeout(20000)
const page = context.pages()[0] || await context.newPage()
const active = '.wx-frame-active'
const inPage = selector => page.locator(`${active} ${selector}`)

async function ask(question, check) {
  const before = await inPage('.message.assistant .bubble:not(.typing)').count()
  await inPage('.composer wx-input input').fill(question)
  await inPage('.composer wx-button').click()
  await inPage('.message.assistant .bubble:not(.typing)').nth(before).waitFor({ timeout: 70000 })
  const reply = (await inPage('.message.assistant .bubble:not(.typing)').nth(before).innerText()).trim()
  const problem = check(reply)
  console.log(`${problem ? '✗' : '✓'} > ${question}\n    ${reply.replace(/\n/g, ' / ').slice(0, 260)}${problem ? `\n    !! ${problem}` : ''}`)
  if (problem) failures++
}

let saved = null
try {
  // The Chinese interface: the case the English questions used to fail in. The profile may have
  // English remembered, so the choice is written where the app keeps it, then the app reloaded.
  await page.goto(`${BASE}/app.html`)
  saved = await page.evaluate(() => ({ language: localStorage.getItem('helphub:language'), remembered: localStorage.getItem('helphub:languageRemembered') }))
  await page.evaluate(() => {
    localStorage.setItem('helphub:language', JSON.stringify({ v: 'zh' }))
    localStorage.setItem('helphub:languageRemembered', JSON.stringify({ v: true }))
  })
  await page.goto(`${BASE}/app.html`)
  await page.locator(`${active} .wx-tabbar-item`).first().waitFor()
  await page.locator(`${active} .wx-tabbar-item`).nth(0).click()
  await page.locator(active).getByText('问智能助手', { exact: true }).first().click()
  await inPage('.composer').waitFor()
  const english = reply => HAN.test(reply.replace(/"[^"]*"|\([^)]*\)/g, '')) ? 'not in English' : null
  await ask('help me set my location', reply => english(reply) || (/\b120\b|110/.test(reply) ? 'answered as an emergency' : null) || (/address/i.test(reply) ? null : 'does not ask for the address'))
  await ask('Is there any rice?', reply => english(reply) || (/Rice/.test(reply) ? null : 'no rice in the answer'))
  await ask('how do I cancel a request?', reply => english(reply) || (/Cancel request|取消申请/.test(reply) ? null : 'no steps'))
  await ask('有大米吗', reply => HAN.test(reply) && /大米/.test(reply) ? null : 'not a Chinese answer about rice')
  await page.screenshot({ path: join(out, 'assistant-live-zh-ui.png') })
} finally {
  // Leave the profile's language as it was.
  if (saved) {
    await page.evaluate(previous => {
      for (const [key, value] of [['helphub:language', previous.language], ['helphub:languageRemembered', previous.remembered]]) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value)
      }
    }, saved).catch(() => {})
  }
  await context.close()
}
console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
