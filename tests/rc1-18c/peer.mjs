import https from 'node:https'
import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const root = '/peer-state'
const statePath = `${root}/state.json`
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { inbox: [], records: {}, calls: {} }
const keysPath = `${root}/keys.json`
const keys = existsSync(keysPath)
  ? JSON.parse(readFileSync(keysPath, 'utf8'))
  : generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
if (!existsSync(keysPath)) writeFileSync(keysPath, JSON.stringify(keys), { mode: 0o600 })
const origin = 'https://127.0.0.1:3450'
const actorId = `${origin}/actor`
const localActor = 'https://rc118c.example.test:3443/ap/actors/main'
const save = () => writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 })
https
  .createServer(
    { key: readFileSync('/tls/key.pem'), cert: readFileSync('/tls/cert.pem') },
    async (request, response) => {
      const pathname = new URL(request.url, origin).pathname
      const send = (status, body) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(body))
      }
      let raw = ''
      for await (const chunk of request) {
        raw += chunk
        if (raw.length > 262144) {
          send(413, {})
          return
        }
      }
      const body = raw ? JSON.parse(raw) : {}
      state.calls[pathname] = (state.calls[pathname] ?? 0) + 1
      try {
        if (pathname === '/actor')
          return send(200, {
            '@context': 'https://www.w3.org/ns/activitystreams',
            id: actorId,
            type: 'Person',
            preferredUsername: '18c-independent-local-peer',
            inbox: `${origin}/inbox`,
            publicKey: { id: `${actorId}#key`, owner: actorId, publicKeyPem: keys.publicKey },
          })
        if (pathname === '/send') {
          const activity = {
            '@context': 'https://www.w3.org/ns/activitystreams',
            id: `${actorId}#follow-18c`,
            type: 'Follow',
            actor: actorId,
            object: localActor,
          }
          const text = JSON.stringify(activity)
          const date = new Date().toUTCString()
          const digest = `SHA-256=${createHash('sha256').update(text).digest('base64')}`
          const signing = `(request-target): post /ap/actors/main/inbox\nhost: rc118c.example.test:3443\ndate: ${date}\ndigest: ${digest}`
          const signature = createSign('RSA-SHA256').update(signing).sign(keys.privateKey, 'base64')
          const result = await fetch(`${localActor}/inbox`, {
            method: 'POST',
            headers: {
              'content-type': 'application/activity+json',
              host: 'rc118c.example.test:3443',
              date,
              digest,
              signature: `keyId="${actorId}#key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${body.invalid ? 'invalid' : signature}"`,
            },
            body: text,
          })
          save()
          return send(200, { inboxStatus: result.status, response: await result.text() })
        }
        if (pathname === '/inbox') {
          const signature = request.headers.signature?.match(/signature="([^"]+)"/)?.[1]
          const actor = await (await fetch(localActor)).json()
          const signing = `(request-target): post /inbox\nhost: 127.0.0.1:3450\ndate: ${request.headers.date}\ndigest: ${request.headers.digest}`
          const verified = Boolean(
            signature &&
              createVerify('RSA-SHA256')
                .update(signing)
                .verify(actor.publicKey.publicKeyPem, signature, 'base64'),
          )
          if (!verified) return send(401, { verified: false })
          state.inbox.push({ body, verified })
          save()
          return send(202, { accepted: true })
        }
        if (pathname === '/stats')
          return send(200, {
            inbox: state.inbox,
            recordCount: Object.keys(state.records).length,
            calls: state.calls,
          })
        if (
          pathname.startsWith('/xrpc/') &&
          !pathname.endsWith('com.atproto.server.createSession') &&
          request.headers.authorization !== 'Bearer 18c-local-session'
        )
          return send(401, { error: 'AuthenticationRequired' })
        if (pathname.endsWith('com.atproto.server.createSession'))
          return send(
            body.identifier === 'journal.rc118c.test' &&
              body.password === 'disposable-local-password'
              ? 200
              : 401,
            body.identifier === 'journal.rc118c.test' &&
              body.password === 'disposable-local-password'
              ? {
                  accessJwt: '18c-local-session',
                  refreshJwt: '18c-local-refresh',
                  did: 'did:plc:rc118cpeer',
                  handle: 'journal.rc118c.test',
                }
              : { error: 'AuthenticationRequired' },
          )
        if (pathname.endsWith('com.atproto.repo.getRecord')) {
          const rkey = new URL(request.url, origin).searchParams.get('rkey')
          return state.records[rkey]
            ? send(200, state.records[rkey])
            : send(404, { error: 'RecordNotFound' })
        }
        if (
          pathname.endsWith('com.atproto.repo.putRecord') ||
          pathname.endsWith('com.atproto.repo.createRecord')
        ) {
          const rkey = body.rkey
          state.records[rkey] = {
            uri: `at://did:plc:rc118cpeer/app.bsky.feed.post/${rkey}`,
            cid: `local-harness-${rkey}`,
            value: body.record,
          }
          save()
          return send(200, state.records[rkey])
        }
        send(404, { error: 'Local harness route missing' })
      } catch (error) {
        send(500, { error: String(error) })
      }
    },
  )
  .listen(3450, '127.0.0.1')
