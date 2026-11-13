// Pixel fidelity against WeChat: element sizes measured in WeChat DevTools (base library 3.17.2,
// iPhone 12, 390 × 671, DPR 3, the 1.1.8 pages) compared with the same elements on the web.
//   BASE_URL=http://localhost:5175 node e2e/fidelity.mjs
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
const BASE = process.env.BASE_URL || 'http://localhost:5175'
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find(path => path && existsSync(path))
let failures = 0
const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 390, height: 671 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await context.newPage()
await page.addInitScript(() => { localStorage.setItem('helphub:language', '{"v":"zh"}'); localStorage.setItem('helphub:languageRemembered', '{"v":true}') })
const truth = {
  'pages/home/index': { '.hero-btn': [156.5, 42], '.mini-btn': [184, 16.94], '.hero': [322, 164.85] },
  'pages/request-create/index': { '.btn': [184, 45], '.textarea': [330, 150], '.input': [133.32, 45], '.picker': [330, 42.67] },
  'pages/profile/index': { '.logout': [184, 34.34] },
  'pages/assistant/index': { '.composer wx-button': [67, 40] },
  'pages/place/index': { '.search-btn': [88, 32] }
}
for (const [route, items] of Object.entries(truth)) {
  await page.goto(`${BASE}/app.html#/${route}`)
  await page.reload()
  await page.waitForTimeout(2500)
  for (const [selector, [w, h]] of Object.entries(items)) {
    const size = await page.evaluate(sel => {
      const el = document.querySelector(`.wx-frame-active ${sel}`)
      if (!el) return null
      const cs = getComputedStyle(el)
      // WeChat's element.size() reports the content box.
      return { w: parseFloat(cs.width), h: parseFloat(cs.height) }
    }, selector)
    const ok = size && Math.abs(size.w - w) < 1 && Math.abs(size.h - h) < 1
    if (!ok) failures++
    console.log(`${ok ? '✓' : '✗'} ${route.split('/')[1].padEnd(15)} ${selector.padEnd(20)} WeChat ${w}×${h}  web ${size ? size.w.toFixed(2) + '×' + size.h.toFixed(2) : 'missing'}`)
  }
}
await browser.close()
console.log(failures ? `${failures} element(s) differ from WeChat` : 'Every measured element matches WeChat.')
process.exit(failures ? 1 : 0)
