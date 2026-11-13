import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  scenarios: {
    resident_reads: { executor: 'ramping-arrival-rate', startRate: 1, timeUnit: '1s', preAllocatedVUs: 40, maxVUs: 40,
      stages: [{ target: 20, duration: '15s' }, { target: 20, duration: '30s' }, { target: 0, duration: '10s' }] },
  },
  thresholds: {
    checks: ['rate>0.99'],
    dropped_iterations: ['count==0'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

const base = __ENV.API_BASE_URL || 'http://localhost:8081/api'

export function setup() {
  const response = http.post(`${base}/auth/dev-login`, JSON.stringify({ phone: '13800000003' }),
    { headers: { 'Content-Type': 'application/json' } })
  check(response, { 'development login succeeds': r => r.status === 200 })
  return { token: response.json('accessToken') }
}

export default function (data) {
  // Each iteration models a different resident behind the production reverse proxy.
  // The proxy must replace, rather than append untrusted, X-Forwarded-For values.
  const simulatedResident = (__VU * 100000 + __ITER) % 65000
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'X-Forwarded-For': `10.20.${Math.floor(simulatedResident / 250)}.${simulatedResident % 250 + 1}`,
  }
  const responses = http.batch([
    ['GET', `${base}/resident/inventory`, null, { headers }],
    ['GET', `${base}/resident/requests?limit=20`, null, { headers }],
    ['GET', `${base}/resident/carts`, null, { headers }],
    ['GET', `${base}/resident/service-points?latitude=31.2304&longitude=121.4737&radiusMeters=10000`, null, { headers }],
  ])
  responses.forEach(response => check(response, { 'resident read succeeds': r => r.status === 200 }))
  sleep(Math.random())
}
