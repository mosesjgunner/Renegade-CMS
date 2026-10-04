import { createServer } from 'node:http'

// Local AT Protocol boundary only. Records are created by real HTTP requests, never database edits.
const records = new Map()
const state = { creates: {}, requests: {}, mode: 'fail' }
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:3130')
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname === '/state') return send(200, { ...state, records: [...records.keys()] })
  if (url.pathname === '/recover') {
    state.mode = 'lose-response'
    return send(200, state)
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : {}
  if (url.pathname.endsWith('createSession'))
    return send(200, {
      accessJwt: body.identifier,
      did: `did:plc:${body.identifier.split('.')[0]}`,
    })
  const repo = body.repo || url.searchParams.get('repo')
  const rkey = body.rkey || url.searchParams.get('rkey')
  const key = `${repo}/${rkey}`
  if (url.pathname.endsWith('getRecord'))
    return records.has(key) ? send(200, records.get(key)) : send(404, { error: 'RecordNotFound' })
  if (url.pathname.endsWith('createRecord')) {
    state.requests[repo] = (state.requests[repo] || 0) + 1
    if (repo === 'did:plc:bad' && state.mode === 'fail')
      return send(422, {
        error: 'DestinationDisabled',
        message: 'RC03 destination disabled; repair provider then retry failed delivery.',
      })
    if (records.has(key)) return send(409, { error: 'RecordAlreadyExists' })
    const record = { uri: `at://${repo}/app.bsky.feed.post/${rkey}`, value: body.record }
    records.set(key, record)
    state.creates[repo] = (state.creates[repo] || 0) + 1
    if (repo === 'did:plc:bad' && state.mode === 'lose-response') {
      state.mode = 'healthy'
      return send(503, {
        message: 'Accepted post response lost; recover using the stable record key.',
      })
    }
    return send(200, record)
  }
  send(404, {})
}).listen(3130, '127.0.0.1')
