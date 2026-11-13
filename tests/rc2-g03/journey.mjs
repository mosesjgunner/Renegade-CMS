/**
 * RC2-G-03 network journey: this installation's publication is an ActivityPub
 * actor; a deterministic local peer (tests/rc2-g03/peer.mjs, HTTPS loopback,
 * the shape NETWORK_LOCAL_PEER_ORIGINS allows) discovers it, follows it with a
 * properly HTTP-signed activity, receives the signed Accept delivery, posts a
 * federated reply that lands in the article discussion — and is then blocked,
 * after which its signed activities are refused. Forged signatures and
 * unknown actors fail closed.
 */
import { createHash, createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const base = 'http://localhost:39071'
const tlsDir = process.env.G03_TLS_DIR
const setup = JSON.parse(readFileSync('/tmp/g03-setup.json', 'utf8'))
const world = JSON.parse(readFileSync('/tmp/b01-world.json', 'utf8'))
const peerId = 'https://127.0.0.1:3132/actors/peer'
const peerKey = readFileSync(`${tlsDir}/peer-sign.key`, 'utf8')
const actorUrl = `${base}/ap/actors/${setup.handle}`
const inboxUrl = `${actorUrl}/inbox`
let failures = 0
let followersAfterFollow = 0
const stage = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function sign(path, body, keyPem) {
  const date = new Date().toUTCString()
  const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`
  const signingString = [
    `(request-target): post ${path}`,
    `host: localhost:39071`,
    `date: ${date}`,
    `digest: ${digest}`,
  ].join('\n')
  const signer = createSign('RSA-SHA256')
  signer.update(signingString)
  const signature = signer.sign(keyPem, 'base64')
  return {
    Date: date,
    Digest: digest,
    Signature: `keyId="${peerId}#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`,
    'Content-Type': 'application/activity+json',
  }
}
async function postActivity(activity, keyPem = peerKey) {
  const body = JSON.stringify(activity)
  const path = `/ap/actors/${setup.handle}/inbox`
  return fetch(inboxUrl, { method: 'POST', headers: sign(path, body, keyPem), body })
}
const followers = async () => {
  const res = await fetch(`${actorUrl}/followers`)
  const doc = await res.json().catch(() => ({}))
  return { status: res.status, items: doc.orderedItems ?? [] }
}
const peerState = async () =>
  (await (await fetch('https://127.0.0.1:3132/state')).json().catch(() => ({ deliveries: [] })))
    .deliveries

// 0. Clean slate: remove any block decision a previous run left for the peer,
// and note how many deliveries the peer already holds.
const adminHeaders0 = { Cookie: `renegade-passkey=${world.cookies.adminA}` }
{
  const list = await fetch(
    `${base}/api/network-access-decisions?where[subject][equals]=${encodeURIComponent(peerId)}`,
    { headers: adminHeaders0 },
  )
  for (const doc of (await list.json().catch(() => ({}))).docs ?? []) {
    await fetch(`${base}/api/network-access-decisions/${doc.id}`, {
      method: 'DELETE',
      headers: adminHeaders0,
    })
  }
}
const baselineDeliveries = (await peerState()).length

// 1. Discovery + actor readback (the separately verified integrity readback).
{
  const wf = await fetch(
    `${base}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${setup.handle}@localhost:39071`)}`,
  )
  const wfDoc = await wf.json().catch(() => ({}))
  const actorRes = await fetch(actorUrl, { headers: { Accept: 'application/activity+json' } })
  const actor = await actorRes.json().catch(() => ({}))
  stage(
    '1. webfinger + actor document',
    wf.status === 200 &&
      wfDoc.links?.[0]?.href === actorUrl &&
      actorRes.status === 200 &&
      actor.id === actorUrl &&
      actor.publicKey?.owner === actorUrl &&
      actor.inbox === inboxUrl,
    `wf=${wf.status} actor=${actorRes.status}`,
  )
  const outbox = await fetch(`${actorUrl}/outbox`)
  stage('1b. outbox readback', outbox.status === 200, `status ${outbox.status}`)
}

// 2. Signed Follow → persisted relationship + signed Accept delivered to the peer.
const followId = `${peerId}/activities/follow-g03-${Date.now()}`
{
  const res = await postActivity({ id: followId, type: 'Follow', actor: peerId, object: actorUrl })
  await sleep(500)
  const f = await followers()
  followersAfterFollow = f.items.filter((x) => x === peerId).length
  stage(
    '2. signed Follow accepted and persisted',
    res.status === 202 && followersAfterFollow >= 1,
    `inbox=${res.status} followers=${JSON.stringify(f.items)}`,
  )
  let accept = null
  for (let i = 0; i < 30 && !accept; i += 1) {
    const deliveries = await peerState()
    accept = deliveries.slice(baselineDeliveries).find((d) => d.body?.type === 'Accept')
    if (!accept) await sleep(3000)
  }
  stage(
    '2b. Accept delivered to the peer inbox',
    Boolean(accept) && accept.body.actor === actorUrl,
    accept ? `accept from ${accept.body.actor}` : 'no Accept within 90s',
  )
}

// 3. Replay of the same Follow dedupes.
{
  const res = await postActivity({ id: followId, type: 'Follow', actor: peerId, object: actorUrl })
  const f = await followers()
  stage(
    '3. replayed Follow deduped',
    res.status === 202 && f.items.filter((x) => x === peerId).length === followersAfterFollow,
    `inbox=${res.status} follower entries=${f.items.length} (was ${followersAfterFollow})`,
  )
}

// 4. Forged signature (wrong key) is refused and changes nothing.
{
  const wrongKey = readFileSync(`${tlsDir}/actor.key`, 'utf8')
  const res = await postActivity(
    { id: `${peerId}/activities/follow-forged`, type: 'Follow', actor: peerId, object: actorUrl },
    wrongKey,
  )
  const f = await followers()
  stage(
    '4. forged signature refused',
    res.status === 401 && f.items.filter((x) => x === peerId).length === followersAfterFollow,
    `inbox=${res.status}`,
  )
}

// 5. Signed federated reply lands in the article discussion.
{
  const res = await postActivity({
    id: `${peerId}/activities/create-g03-${Date.now()}`,
    type: 'Create',
    actor: peerId,
    object: {
      id: `${peerId}/notes/g03-${Date.now()}`,
      type: 'Note',
      inReplyTo: `${base}${setup.articlePath}`,
      content: 'Federated reply from the G-03 peer.',
    },
  })
  await sleep(500)
  const list = await fetch(
    `${base}/api/discussion-posts?where[discussion][equals]=${setup.discussionId}&depth=0`,
    { headers: { Cookie: `renegade-passkey=${world.cookies.adminA}` } },
  )
  const docs = (await list.json().catch(() => ({}))).docs ?? []
  const found = docs.some((d) => JSON.stringify(d).includes('Federated reply from the G-03 peer'))
  stage(
    '5. federated reply persisted in the discussion',
    res.status === 202 && found,
    `inbox=${res.status} posts=${docs.length} found=${found}`,
  )
}

// 6. Operator blocks the peer → its next signed activity is refused.
{
  const adminHeaders = {
    'Content-Type': 'application/json',
    Cookie: `renegade-passkey=${world.cookies.adminA}`,
  }
  const existing = await fetch(
    `${base}/api/network-access-decisions?where[subject][equals]=${encodeURIComponent(peerId)}`,
    { headers: adminHeaders },
  )
  const alreadyBlocked = ((await existing.json().catch(() => ({}))).docs ?? []).some(
    (d) => d.decision === 'block',
  )
  const block = alreadyBlocked
    ? { status: 200 }
    : await fetch(`${base}/api/network-access-decisions`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          subject: peerId,
          subjectType: 'actor',
          decision: 'block',
          reason: 'G-03 revocation proof',
        }),
      })
  const res = await postActivity({
    id: `${peerId}/activities/create-g03-2`,
    type: 'Create',
    actor: peerId,
    object: {
      id: `${peerId}/notes/g03-2`,
      type: 'Note',
      inReplyTo: `${base}${setup.articlePath}`,
      content: 'This reply must never land.',
    },
  })
  stage(
    '6. blocked peer refused after revocation',
    [200, 201].includes(block.status) && res.status === 401,
    `block=${block.status} inbox=${res.status}`,
  )
}

// 7. Unknown actors fail closed.
{
  const a = await fetch(`${base}/ap/actors/no-such-publication`)
  const w = await fetch(
    `${base}/.well-known/webfinger?resource=${encodeURIComponent('acct:nobody@localhost:39071')}`,
  )
  stage(
    '7. unknown actor + webfinger 404',
    a.status === 404 && w.status === 404,
    `actor=${a.status} wf=${w.status}`,
  )
}

console.log(failures === 0 ? 'G-03 JOURNEY: ALL PASS' : `G-03 JOURNEY: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
