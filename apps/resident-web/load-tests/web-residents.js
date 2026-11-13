// Load test of the web version's traffic: every iteration is a new browser — it signs in with a
// fresh device key (POST /api/auth/web), loads what the home, map and status pages load, and one
// in five submits a supply request (idempotent, like the WeChat application).
//
//   docker run --rm -i --network helphub-web_default -e API_BASE_URL=http://backend:8080/api -e RATE=8 \
//     grafana/k6:1.1.0 run - < load-tests/web-residents.js
import http from 'k6/http'
import crypto from 'k6/crypto'
import encoding from 'k6/encoding'
import { check } from 'k6'

const base = __ENV.API_BASE_URL || 'http://localhost:8082/api'
// New browsers per second at the plateau (default 30: far beyond the expected daily traffic).
const rate = Number(__ENV.RATE || 30)

export const options = {
  scenarios: {
    new_web_residents: {
      executor: 'ramping-arrival-rate', startRate: 2, timeUnit: '1s', preAllocatedVUs: 120, maxVUs: 240,
      stages: [{ target: rate, duration: '15s' }, { target: rate, duration: '60s' }, { target: 0, duration: '10s' }]
    }
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:read}': ['p(95)<500'],
    'http_req_duration{kind:login}': ['p(95)<800'],
    'http_req_duration{kind:submit}': ['p(95)<1000']
  }
}

export default function () {
  // Each browser comes from its own address, as real residents do (the per-address rate limit).
  const n = (__VU * 100000 + __ITER) % 64000
  const forwarded = `10.30.${Math.floor(n / 250)}.${(n % 250) + 1}`
  const deviceKey = encoding.b64encode(crypto.randomBytes(32), 'rawurl')
  const login = http.post(`${base}/auth/web`, JSON.stringify({ deviceKey, displayName: '社区居民' }),
    { headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded }, tags: { kind: 'login' } })
  if (!check(login, { 'web sign-in succeeds': r => r.status === 200 })) return
  const headers = { Authorization: `Bearer ${login.json('accessToken')}`, 'X-Forwarded-For': forwarded, 'X-Client-Release': '1.1.8' }
  const read = { headers, tags: { kind: 'read' } }
  const profile = http.get(`${base}/resident/profile`, read)
  check(profile, { 'profile loads': r => r.status === 200 })
  const latitude = profile.json('defaultLatitude') || 31.1665
  const longitude = profile.json('defaultLongitude') || 121.1111
  const pages = http.batch([
    ['GET', `${base}/resident/service-points?latitude=${latitude}&longitude=${longitude}&radiusMeters=10000`, null, read],
    ['GET', `${base}/resident/inventory`, null, read],
    ['GET', `${base}/resident/requests?limit=3`, null, read],
    ['GET', `${base}/resident/carts`, null, read],
    ['GET', `${base}/resident/notifications`, null, read]
  ])
  pages.forEach(response => check(response, { 'page data loads': r => r.status === 200 }))
  if (__ITER % 5 !== 0) return
  const stock = (pages[1].json() || []).find(item => item.freeQuantity > 5 && item.unitPriceFen === 0)
  if (!stock) return
  const key = encoding.b64encode(crypto.randomBytes(12), 'rawurl')
  const submit = http.post(`${base}/resident/requests?idempotencyKey=${key}`, JSON.stringify({
    category: stock.category, inventoryItemId: stock.id, itemDescription: stock.name, quantity: 1, urgency: 'NORMAL',
    fulfillmentMethod: 'PICKUP', preferredStart: null, preferredEnd: null, latitude, longitude,
    approximateAddress: null, accessibilityNotes: null
  }), { headers: { ...headers, 'Content-Type': 'application/json', 'X-Idempotency-Key': key }, tags: { kind: 'submit' } })
  check(submit, { 'request is accepted': r => r.status === 200 || r.status === 201 })
}
