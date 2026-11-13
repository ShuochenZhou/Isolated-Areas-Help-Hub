// Asks the live assistant a few things as the resident whose browser profile is given, through the
// web version's own login, and prints what comes back. No new resident is created.
//   PROFILE=<chrome user data dir> BASE_URL=https://qingpu-help-hub.vercel.app node e2e/assistant-live-check.mjs "question" ...
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'https://qingpu-help-hub.vercel.app'
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => path && existsSync(path))
const questions = process.argv.slice(2)

const context = await chromium.launchPersistentContext(process.env.PROFILE, { executablePath: CHROME, headless: true })
try {
  const page = context.pages()[0] || await context.newPage()
  await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' })
  // The web version signs the resident in from the device key kept in this profile.
  let token = null
  for (let i = 0; i < 40 && !token; i++) {
    await page.waitForTimeout(500)
    token = await page.evaluate(() => {
      for (let k = 0; k < localStorage.length; k++) {
        const key = localStorage.key(k)
        if (/accessToken/.test(key)) {
          const raw = localStorage.getItem(key)
          // The runtime keeps each value as {"v": value} (src/runtime/storage.ts).
          try { const v = JSON.parse(raw).v; return typeof v === 'string' && v ? v : null } catch (e) { return null }
        }
      }
      return null
    })
  }
  if (!token) throw new Error('not signed in')
  // For probes that need no browser (kept next to the profile, never printed).
  if (process.env.TOKEN_FILE) (await import('node:fs')).writeFileSync(process.env.TOKEN_FILE, token)
  const api = await page.evaluate(() => (window.__HELPHUB_API__ || ''))
  let conversationId = null
  for (const message of questions) {
    const result = await page.evaluate(async ({ message, token, conversationId, api }) => {
      const base = api || 'https://resident-web-319184-5-1495414290.sh.run.tcloudbase.com'
      const res = await fetch(`${base}/api/resident/assistant/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ conversationId, message, language: 'zh' })
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    }, { message, token, conversationId, api })
    conversationId = result.body && result.body.conversationId
    const body = result.body || {}
    console.log(`> ${message}\n  [${result.status}] replyLanguage=${body.replyLanguage} modelUsed=${body.modelUsed} actions=${JSON.stringify((body.clientActions || []).map(a => a.type))}\n  ${String(body.message).slice(0, 240).replace(/\n/g, ' / ')}`)
  }
} finally {
  await context.close()
}
