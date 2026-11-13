// Verify the navigation menu in every supported language against the live page. The check uses an
// existing browser profile and restores its previous language afterwards.
//   PROFILE=<chrome user data dir> BASE_URL=https://qingpu-help-hub.vercel.app node e2e/menu-language-check.mjs
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'https://qingpu-help-hub.vercel.app'
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => path && existsSync(path))
const out = join(dirname(fileURLToPath(import.meta.url)), 'artifacts')
mkdirSync(out, { recursive: true })
const expected = { en: ['Share', 'Copy link', 'Cancel'], zh: ['分享', '复制链接', '取消'] }
let failures = 0

// A Chinese browser, as the resident's is: the menu must still follow the language chosen in the app.
const context = await chromium.launchPersistentContext(process.env.PROFILE, {
  executablePath: CHROME, headless: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN'
})
context.setDefaultTimeout(20000)
const page = context.pages()[0] || await context.newPage()
let saved = null
try {
  await page.goto(`${BASE}/app.html`)
  saved = await page.evaluate(() => ({ language: localStorage.getItem('helphub:language'), remembered: localStorage.getItem('helphub:languageRemembered') }))
  for (const language of ['en', 'zh']) {
    await page.evaluate(value => {
      localStorage.setItem('helphub:language', JSON.stringify({ v: value }))
      localStorage.setItem('helphub:languageRemembered', JSON.stringify({ v: true }))
    }, language)
    await page.goto(`${BASE}/app.html`)
    await page.locator('.wx-frame-active .wx-tabbar-item').first().waitFor()
    await page.locator('.wx-capsule button').first().click()
    await page.locator('.wx-action-item').first().waitFor()
    const items = (await page.locator('.wx-action-item').allInnerTexts()).map(text => text.trim())
    await page.screenshot({ path: join(out, `menu-${language}.png`) })
    const ok = JSON.stringify(items) === JSON.stringify(expected[language])
    console.log(`${ok ? '✓' : '✗'} ${language === 'en' ? '英文' : '中文'}模式菜单：${items.join(' | ')}`)
    if (!ok) failures++
    await page.locator('.wx-action-cancel').click()
  }
} finally {
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
