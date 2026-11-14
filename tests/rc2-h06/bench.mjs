// RC2-H-06 benchmark harness — HTTP timing for the standalone server.
//
// Usage: node tests/rc2-h06/bench.mjs <world.json> <port> <out.json> [warmSamples]
// Routes are hit with node:http and an explicit Host header (site resolution
// is host-based). Cold = the first hit of each route after server start
// (run this harness once, immediately). Warm = `warmSamples` sequential hits.
import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'

const [worldPath, portArg, outPath, warmArg] = process.argv.slice(2)
const port = Number(portArg || 39071)
const warmSamples = Number(warmArg || 20)
const world = JSON.parse(readFileSync(worldPath, 'utf8'))
const siteA = world.siteA
const adminCookie = `renegade-passkey=${world.cookies.adminA}`

const routes = [
  { name: 'public-home', host: siteA.host, path: '/' },
  { name: 'public-article', host: siteA.host, path: siteA.publishedCanonicalPath },
  { name: 'admin-shell', host: '127.0.0.1', path: '/admin' },
  {
    name: 'admin-api-schedule-health',
    host: '127.0.0.1',
    path: '/api/admin/schedule-health',
    headers: { cookie: adminCookie, origin: 'http://127.0.0.1:39071' },
  },
  {
    name: 'rest-social-queue-list',
    host: '127.0.0.1',
    path: '/api/social-queue-items?limit=5&depth=0',
    headers: { cookie: adminCookie, origin: 'http://127.0.0.1:39071' },
  },
  {
    name: 'editor-data-content-read',
    host: '127.0.0.1',
    path: `/api/content/${siteA.publishedArticleId}?depth=2`,
    headers: { cookie: adminCookie, origin: 'http://127.0.0.1:39071' },
  },
]

function hit(route) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint()
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: route.path,
        method: 'GET',
        headers: { host: route.host, ...(route.headers || {}) },
      },
      (res) => {
        let bytes = 0
        res.on('data', (chunk) => (bytes += chunk.length))
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - started) / 1e6
          resolve({ ms, status: res.statusCode, bytes })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return {
    n: samples.length,
    min: round(sorted[0]),
    p50: round(pick(0.5)),
    p95: round(pick(0.95)),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
  }
}
const round = (v) => Math.round(v * 10) / 10

const results = { port, at: new Date().toISOString(), routes: {} }
for (const route of routes) {
  const cold = await hit(route)
  const warm = []
  let lastStatus = cold.status
  let bytes = cold.bytes
  for (let i = 0; i < warmSamples; i++) {
    const r = await hit(route)
    warm.push(r.ms)
    lastStatus = r.status
    bytes = r.bytes
  }
  results.routes[route.name] = {
    path: route.path,
    status: lastStatus,
    bytes,
    coldMs: round(cold.ms),
    warm: stats(warm),
  }
  console.log(
    `${route.name}: status=${lastStatus} bytes=${bytes} cold=${round(cold.ms)}ms warm p50=${results.routes[route.name].warm.p50}ms p95=${results.routes[route.name].warm.p95}ms`,
  )
}
writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`wrote ${outPath}`)
