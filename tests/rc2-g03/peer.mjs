/**
 * RC2-G-03 deterministic ActivityPub peer. Serves one remote actor document over
 * HTTPS on numeric loopback (the shape NETWORK_LOCAL_PEER_ORIGINS allows) and
 * records every delivery POSTed to its inbox so the journey can read back what
 * the CMS sent. State is also readable over GET /state for assertions.
 */
import { createServer } from 'node:https'
import { readFileSync, writeFileSync } from 'node:fs'

const tlsDir = process.env.G03_TLS_DIR
const port = 3132
const actorId = `https://127.0.0.1:${port}/actors/peer`
const stateFile = '/tmp/g03-peer-state.json'
const deliveries = []
const persist = () => writeFileSync(stateFile, JSON.stringify({ deliveries }, null, 2))
persist()

const actorDocument = {
  '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
  id: actorId,
  type: 'Person',
  preferredUsername: 'peer',
  name: 'G-03 Deterministic Peer',
  summary: 'A local test peer for the RC2-G-03 network journey.',
  inbox: `https://127.0.0.1:${port}/inbox`,
  outbox: `https://127.0.0.1:${port}/outbox`,
  publicKey: {
    id: `${actorId}#main-key`,
    owner: actorId,
    publicKeyPem: readFileSync(`${tlsDir}/peer-sign.pub`, 'utf8'),
  },
}

const server = createServer(
  {
    key: readFileSync(`${tlsDir}/peer-server.key`),
    cert: readFileSync(`${tlsDir}/peer-server.pem`),
  },
  (req, res) => {
    if (req.method === 'GET' && req.url === '/actors/peer') {
      res.writeHead(200, { 'content-type': 'application/activity+json' })
      res.end(JSON.stringify(actorDocument))
      return
    }
    if (req.method === 'GET' && req.url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ deliveries }))
      return
    }
    if (req.method === 'POST' && req.url === '/inbox') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        deliveries.push({ at: new Date().toISOString(), body: JSON.parse(body || '{}') })
        persist()
        res.writeHead(202)
        res.end()
      })
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  },
)
server.listen(port, '127.0.0.1', () => console.log(`g03 peer listening on ${actorId}`))
