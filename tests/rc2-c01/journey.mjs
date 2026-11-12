// RC2-C-01 — Media upload, rights, derivative and public usage journey.
// Traces one image through upload -> persistence -> rights metadata ->
// variant generation (jobs worker) -> attach to a published article ->
// anonymous public render -> usage view -> replacement, plus corrupt /
// unsupported uploads, missing media, cross-site denials, and a Lean
// (module-off) probe. Requires the RC2 world served in production mode
// AND the jobs worker running (npm run jobs:worker) — the production
// web + worker topology. Plain .mjs (node:http / fetch, no browser).
import { get as httpGet } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'

const BASE = process.env.B01_BASE || 'http://127.0.0.1:39071'
const SHOTS = process.env.C01_SHOTS || '/home/hatch/workspace/gui01b-logs/c01-shots'
const MEDIA_DIR = process.env.C01_MEDIA_DIR || '/home/hatch/workspace/gui01b-logs/b01-media'
const WORLD = JSON.parse(readFileSync(process.env.B01_WORLD || '/tmp/b01-world.json', 'utf8'))
mkdirSync(SHOTS, { recursive: true })
const stamp = Date.now().toString(36)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const results = []
const stage = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

const RED = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAATUlEQVR4nO3PQQkAMAzAwMqpfxWTNRF7HINABFzm7H7dcEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBY9dR/nAeY3iKZkAAAAASUVORK5CYII=',
  'base64',
)
const BLUE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGPQ0DhBU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULABnrYD1Ls2MgAAAAAElFTkSuQmCC',
  'base64',
)
const RED_SHA = sha256(RED)
const BLUE_SHA = sha256(BLUE)

const adminA = WORLD.cookies.adminA
const outsiderB = WORLD.cookies.outsiderB
const siteA = WORLD.siteA.siteId
const articleA = WORLD.siteA.publishedArticleId
const hostA = WORLD.siteA.host

const api = async (path, { method = 'GET', cookie, json, form } = {}) => {
  const headers = {}
  if (cookie) headers.cookie = `renegade-passkey=${cookie}`
  let body
  if (json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }
  const res = await fetch(BASE + path, { method, headers, body })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* binary or empty */
  }
  return { status: res.status, text, data }
}
const rawGet = (host, path, cookie) =>
  new Promise((resolve, reject) => {
    const headers = { host: `${host}:39071` }
    if (cookie) headers.cookie = `renegade-passkey=${cookie}`
    const req = httpGet({ hostname: '127.0.0.1', port: 39071, path, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
      )
    })
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('timeout')))
  })
const uploadForm = (bytes, name, type, fields) => {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type }), name)
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return form
}

// --- 1. upload -----------------------------------------------------------------
const up = await api('/api/media/upload', {
  method: 'POST',
  cookie: adminA,
  form: uploadForm(RED, `c01-journey-${stamp}.png`, 'image/png', {
    siteId: siteA,
    title: `C01 Journey Image ${stamp}`,
    altText: 'A red test rectangle',
  }),
})
const asset = up.data?.asset ?? {}
const assetId = asset.id
stage(
  'upload persists the image with metadata and a matching checksum',
  up.status === 201 &&
    Boolean(assetId) &&
    asset.title === `C01 Journey Image ${stamp}` &&
    asset.altText === 'A red test rectangle' &&
    asset.checksum === `sha256:${RED_SHA}` &&
    String(asset.storageLocation ?? '').startsWith(siteA),
  `status=${up.status} checksum=${asset.checksum} storage=${asset.storageLocation}`,
)

// --- 2. master bytes preserved on disk -------------------------------------------
let diskSha = ''
try {
  diskSha = sha256(readFileSync(`${MEDIA_DIR}/${asset.storageLocation}`))
} catch {
  diskSha = 'unreadable'
}
stage('stored master bytes are the uploaded bytes', diskSha === RED_SHA, `diskSha=${diskSha}`)

// --- 3. not public before use -------------------------------------------------------
const before = await rawGet(hostA, `/media/${assetId}`)
stage(
  'unattached library media is not publicly served (404)',
  before.status === 404,
  `status=${before.status}`,
)

// --- 4. rights metadata ---------------------------------------------------------------
const patch = await api(`/api/media/${assetId}`, {
  method: 'PATCH',
  cookie: adminA,
  json: {
    siteId: siteA,
    license: 'CC BY 4.0',
    creatorCredit: 'Harbor Test Desk',
    copyrightOwner: 'Renegade Test',
    rightsStatus: 'approved',
  },
})
const record = await api(`/api/media-assets/${assetId}?depth=0`, { cookie: adminA })
stage(
  'rights metadata (license, credit, owner) persists',
  patch.status === 200 &&
    record.data?.license === 'CC BY 4.0' &&
    record.data?.creatorCredit === 'Harbor Test Desk' &&
    record.data?.copyrightOwner === 'Renegade Test',
  `patch=${patch.status} license=${record.data?.license}`,
)

// --- 5. variant generation through the jobs worker ---------------------------------------
const queue = await api(`/api/media/${assetId}/variants`, {
  method: 'POST',
  cookie: adminA,
  json: { siteId: siteA, recipeKeys: ['thumbnail'] },
})
let thumb = null
for (let i = 0; i < 24 && !thumb; i++) {
  const v = await api(`/api/media/${assetId}/variants?siteId=${siteA}`, { cookie: adminA })
  thumb = (v.data?.variants ?? []).find(
    (x) => x.recipeKey === 'thumbnail' && x.processingState === 'ready',
  )
  if (!thumb) await sleep(5000)
}
stage(
  'variant job generates a ready thumbnail derivative',
  (queue.status === 200 || queue.status === 202) &&
    Boolean(queue.data?.job?.id) &&
    Boolean(thumb) &&
    thumb.width > 0 &&
    thumb.height > 0,
  `queue=${queue.status} thumb=${thumb ? `${thumb.id} ${thumb.width}x${thumb.height} ${thumb.format}` : 'none after polling'}`,
)

// --- 6. attach as hero ---------------------------------------------------------------------
const attach = await api('/api/media/attach', {
  method: 'POST',
  cookie: adminA,
  json: { mediaId: assetId, contentId: articleA, purpose: 'hero', siteId: siteA },
})
stage(
  'attach to the published article succeeds',
  attach.status === 200 && String(attach.data?.content?.id ?? '') === String(articleA),
  `status=${attach.status}`,
)

// --- 7. anonymous public render --------------------------------------------------------------
const served = await rawGet(hostA, `/media/${assetId}`)
stage(
  'attached media serves anonymously, byte-identical to the master',
  served.status === 200 && sha256(served.body) === RED_SHA,
  `status=${served.status} sha=${sha256(served.body)}`,
)
const servedVariant = await rawGet(hostA, `/media/${assetId}?variant=thumbnail&format=jpeg&v=1`)
stage(
  'the thumbnail variant serves anonymously as a distinct derivative',
  servedVariant.status === 200 &&
    String(servedVariant.headers['content-type']).includes('jpeg') &&
    sha256(servedVariant.body) !== RED_SHA,
  `status=${servedVariant.status} type=${servedVariant.headers['content-type']} bytes=${servedVariant.body.length}`,
)
const articleHtml = await rawGet(hostA, WORLD.siteA.publishedCanonicalPath)
stage(
  'the public article page references the media',
  articleHtml.status === 200 && articleHtml.body.toString('utf8').includes(`/media/${assetId}`),
  `status=${articleHtml.status}`,
)

// --- 8. usage view ------------------------------------------------------------------------------
const detail = await api(`/api/media/${assetId}?siteId=${siteA}`, { cookie: adminA })
const usages = detail.data?.media?.usages ?? []
stage(
  'usage view lists the article as a public hero usage',
  usages.some(
    (u) =>
      String(u.targetId) === String(articleA) &&
      u.field === 'heroMedia' &&
      u.lifecycle === 'public',
  ) && detail.data?.media?.publiclyDeliverable === true,
  `usages=${JSON.stringify(usages).slice(0, 160)}`,
)

// --- 9. replacement ---------------------------------------------------------------------------------
// Replacement is explicit about scope: mode=all-usages creates the new
// asset, rewires every usage, and points the original at it; the
// original identity (and its checksum) stays on record as evidence.
const replaceForm = uploadForm(BLUE, `c01-replacement-${stamp}.png`, 'image/png', {
  siteId: siteA,
})
replaceForm.set('mode', 'all-usages')
replaceForm.set('reason', 'C01 journey replacement proof')
const replace = await api(`/api/media/${assetId}`, {
  method: 'PUT',
  cookie: adminA,
  form: replaceForm,
})
const replacementId = replace.data?.replacement?.id
const originalAfter = await api(`/api/media-assets/${assetId}?depth=0`, { cookie: adminA })
const replacementRecord = replacementId
  ? await api(`/api/media-assets/${replacementId}?depth=0`, { cookie: adminA })
  : { data: null }
const servedAfter = await rawGet(hostA, `/media/${assetId}`)
stage(
  'replacement (all usages) rewires delivery to the new asset; the original identity stays as evidence',
  replace.status === 201 &&
    Boolean(replacementId) &&
    replacementId !== assetId &&
    String(originalAfter.data?.replaceGloballyWith ?? '') === String(replacementId) &&
    originalAfter.data?.checksum === `sha256:${RED_SHA}` &&
    replacementRecord.data?.checksum === `sha256:${BLUE_SHA}` &&
    servedAfter.status === 200 &&
    sha256(servedAfter.body) === BLUE_SHA,
  `replace=${replace.status} replacement=${replacementId} servedSha=${sha256(servedAfter.body)}`,
)

// --- 10. failed / unsupported uploads ------------------------------------------------------------------
const corrupt = await api('/api/media/upload', {
  method: 'POST',
  cookie: adminA,
  form: uploadForm(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('not-a-real-png-body')]),
    `c01-corrupt-${stamp}.png`,
    'image/png',
    { siteId: siteA, title: 'Corrupt upload' },
  ),
})
stage(
  'a corrupt image upload is refused with a clear error, not a success banner',
  corrupt.status >= 400 &&
    corrupt.status < 500 &&
    Boolean(corrupt.data?.error) &&
    !corrupt.data?.asset,
  `status=${corrupt.status} error=${corrupt.data?.error ?? corrupt.text.slice(0, 80)}`,
)
const textUp = await api('/api/media/upload', {
  method: 'POST',
  cookie: adminA,
  form: uploadForm(
    Buffer.from('plain text, not an image\n'),
    `c01-notes-${stamp}.txt`,
    'text/plain',
    {
      siteId: siteA,
      title: 'Text upload',
    },
  ),
})
stage(
  'an unsupported file upload is refused with a clear error',
  textUp.status >= 400 && textUp.status < 500 && Boolean(textUp.data?.error) && !textUp.data?.asset,
  `status=${textUp.status} error=${textUp.data?.error ?? textUp.text.slice(0, 80)}`,
)

// --- 11. missing media -------------------------------------------------------------------------------------
const missingId = '00000000-0000-4000-8000-000000000000'
const missingAnon = await rawGet(hostA, `/media/${missingId}`)
const missingDetail = await api(`/api/media/${missingId}?siteId=${siteA}`, { cookie: adminA })
stage(
  'missing media is a clean 404 on both the public and operator paths',
  missingAnon.status === 404 && missingDetail.status === 404,
  `anon=${missingAnon.status} detail=${missingDetail.status}`,
)

// --- 12. cross-site denials -----------------------------------------------------------------------------------
const outUpload = await api('/api/media/upload', {
  method: 'POST',
  cookie: outsiderB,
  form: uploadForm(RED, `c01-outsider-${stamp}.png`, 'image/png', {
    siteId: siteA,
    title: 'Outsider upload into Site A',
  }),
})
const outDetail = await api(`/api/media/${assetId}?siteId=${siteA}`, { cookie: outsiderB })
const outAttach = await api('/api/media/attach', {
  method: 'POST',
  cookie: outsiderB,
  json: { mediaId: assetId, contentId: articleA, purpose: 'hero', siteId: siteA },
})
stage(
  'Site B principal cannot upload into, read, or attach Site A media',
  outUpload.status >= 400 &&
    outDetail.status >= 400 &&
    outAttach.status >= 400 &&
    !outUpload.data?.asset,
  `upload=${outUpload.status} detail=${outDetail.status} attach=${outAttach.status}`,
)

// --- 13. Lean (module-off) probe ---------------------------------------------------------------------------------
let leanNote = 'not run'
let leanOk = false
try {
  const lean = spawn('bash', ['/home/hatch/workspace/gui01b-logs/c01-lean-start.sh'], {
    detached: true,
    stdio: 'ignore',
  })
  lean.unref()
  let up = false
  for (let i = 0; i < 24 && !up; i++) {
    try {
      const r = await fetch('http://127.0.0.1:39072/admin')
      up = r.status === 200
    } catch {
      up = false
    }
    if (!up) await sleep(5000)
  }
  if (up) {
    const cc = await fetch('http://127.0.0.1:39072/api/media/command-center?siteId=' + siteA, {
      headers: { cookie: `renegade-passkey=${adminA}` },
    })
    const ccText = await cc.text()
    leanNote = `commandCenter=${cc.status} body=${ccText.slice(0, 140)}`
    leanOk = cc.status !== 500 && !ccText.includes('"jobs"')
    const kill = spawn('pkill', ['-f', 'PORT=39072'])
    kill.unref()
  } else {
    leanNote = 'lean server did not come up'
  }
} catch (error) {
  leanNote = `lean probe error: ${error instanceof Error ? error.message : String(error)}`
}
stage('Lean profile: media command center is gated, not a false success', leanOk, leanNote)

const passed = results.filter((r) => r.ok).length
console.log(`\n${passed}/${results.length} stages passed`)
writeFileSync(SHOTS + '/results.json', JSON.stringify({ stamp, results }, null, 2))
process.exit(passed === results.length ? 0 : 1)
