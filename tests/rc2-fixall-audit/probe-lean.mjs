import { request } from 'node:http'
import { readFileSync } from 'node:fs'

// RC2-DEBT-08 floor-profile probe. Usage:
//   node tests/rc2-fixall-audit/probe-lean.mjs <port>
// Expects /tmp/fixall-donation.json from seed-donation.spec.ts.
// Raw HTTP with an explicit Host header, the same shape the RC2
// journeys use — fetch() will not reliably override Host.
const port = Number(process.argv[2] ?? 39072)
const { campaignId, host } = JSON.parse(readFileSync('/tmp/fixall-donation.json', 'utf8'))

function call(label, method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : undefined
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          host,
          'content-type': 'application/json',
          ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let text = ''
        res.on('data', (c) => (text += c))
        res.on('end', () => {
          console.log(
            `${label}: HTTP ${res.statusCode} — ${text.slice(0, 220).replace(/\s+/g, ' ')}`,
          )
          resolve(res.statusCode)
        })
      },
    )
    req.on('error', (e) => {
      console.log(`${label}: ERROR ${e.message}`)
      resolve(0)
    })
    if (data) req.write(data)
    req.end()
  })
}

await call(
  'floor-registered  GET /api/donation-campaigns',
  'GET',
  '/api/donation-campaigns?limit=1',
)
await call(
  'commerce-gated   GET /api/merchant-connections',
  'GET',
  '/api/merchant-connections?limit=1',
)
await call(
  'donate seam      POST /api/commerce/donations/intent',
  'POST',
  '/api/commerce/donations/intent',
  {
    campaignId,
    currency: 'USD',
    amountMinor: '1000',
    recurrence: 'one-time',
    recognition: 'anonymous',
    email: 'donor@fixall-audit.test',
  },
)
