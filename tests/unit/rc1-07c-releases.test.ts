/* eslint-disable @typescript-eslint/no-explicit-any -- focused persistence doubles */
import { describe, expect, it } from 'vitest'
import { assertReleaseArtifactScope } from '../../src/modules/releases/artifact-scope'
import { computeReleaseFingerprint } from '../../src/modules/releases/gates'
import { executeReleaseSaga, rollbackReleaseSaga } from '../../src/modules/releases/saga'
import { pinArtifact, unpinArtifact, cancelRelease } from '../../src/modules/releases/service'

function fixture() {
  const release: any = {
    id: 'r',
    site: 'a',
    status: 'draft',
    releaseRevision: 1,
    artifacts: [],
    executionAudit: [],
  }
  const docs: any = {
    'content-releases': { r: release },
    'email-messages': {
      mail: { id: 'mail', site: 'a', subject: 'Reviewed', blocks: [], status: 'review' },
    },
    'article-family-content': {
      article: { id: 'article', content: 'content', currentRevision: 'rev' },
    },
    content: { content: { id: 'content', site: 'a' } },
    'social-drafts': { draft: { id: 'draft', site: 'a' } },
    'social-accounts': { foreign: { id: 'foreign', site: 'b' } },
  }
  let writes = 0
  const payload: any = {
    findByID: async ({ collection, id }: any) => structuredClone(docs[collection]?.[id] ?? null),
    find: async ({ collection }: any) => ({ docs: Object.values(docs[collection] ?? {}) }),
    update: async ({ collection, id, data }: any) => {
      writes++
      Object.assign(docs[collection][id], structuredClone(data))
      return structuredClone(docs[collection][id])
    },
  }
  return { payload, docs, release, writes: () => writes }
}
const artifact: any = {
  targetType: 'newsletter',
  targetId: 'mail',
  title: 'Mail',
  pinnedHash: 'user-label',
}
function approved(release: any) {
  const fingerprint = computeReleaseFingerprint(release)
  release.status = 'approved'
  release.gateSnapshot = { isValid: true, evaluatedFingerprint: fingerprint }
  release.approvals = [
    {
      decision: 'approved',
      releaseRevision: release.releaseRevision,
      gateSnapshotFingerprint: fingerprint,
    },
  ]
}
describe('07C release authority and recovery', () => {
  it('resolves article authority from canonical content rather than caller hints', async () => {
    const f = fixture()
    expect(
      await assertReleaseArtifactScope(f.payload, f.release, {
        ...artifact,
        targetType: 'article',
        targetId: 'article',
      }),
    ).toMatch(/^[a-f0-9]{64}$/)
    f.docs.content.content.site = 'b'
    await expect(
      assertReleaseArtifactScope(f.payload, f.release, {
        ...artifact,
        targetType: 'article',
        targetId: 'article',
      }),
    ).rejects.toThrow('same site')
    expect(f.writes()).toBe(0)
  })
  it('rejects a foreign distribution destination before outbox writes', async () => {
    const f = fixture()
    f.docs['social-network-variants'] = { v: { id: 'v', draft: 'draft', account: 'foreign' } }
    await expect(
      pinArtifact(
        f.payload,
        'r',
        { ...artifact, targetType: 'distribution', targetId: 'draft' },
        'owner',
      ),
    ).rejects.toThrow('another site')
    expect(f.writes()).toBe(0)
  })
  it('compares persisted JSON semantically across PostgreSQL key ordering', async () => {
    const f = fixture()
    const rule: any = {
      fromPath: '/old',
      toPath: '/new',
      statusCode: '308',
      match: 'exact',
      enabled: true,
    }
    const item: any = { ...artifact, targetType: 'redirect', redirectRule: rule }
    const before = await assertReleaseArtifactScope(f.payload, f.release, item)
    item.redirectRule = Object.fromEntries(Object.entries(rule).reverse())
    expect(await assertReleaseArtifactScope(f.payload, f.release, item)).toBe(before)
  })
  it('rejects unknown artifact types without synthetic success', async () => {
    const f = fixture()
    await expect(
      pinArtifact(f.payload, 'r', { ...artifact, targetType: 'invented' }, 'owner'),
    ).rejects.toThrow('Unsupported')
    expect(f.writes()).toBe(0)
  })
  it('pins persisted material independently from supplied hash labels', async () => {
    const f = fixture()
    const first = await pinArtifact(f.payload, 'r', artifact, 'owner')
    const hash = first.artifacts[0].pinnedStateHash
    f.docs['email-messages'].mail.subject = 'Changed'
    const second = await pinArtifact(f.payload, 'r', artifact, 'owner')
    expect(second.artifacts[0].pinnedHash).toBe('user-label')
    expect(second.artifacts[0].pinnedStateHash).not.toBe(hash)
  })
  it('blocks changed approved material before dispatch and persists actionable failure', async () => {
    const f = fixture()
    await pinArtifact(f.payload, 'r', artifact, 'owner')
    approved(f.release)
    f.docs['email-messages'].mail.subject = 'Unreviewed replacement'
    const result = await executeReleaseSaga(f.payload, { releaseId: 'r', actorId: 'owner' })
    expect(result.status).toBe('failed')
    expect(result.failedSteps[0].error).toContain('Pinned artifact has changed')
    expect(f.docs['email-messages'].mail.status).toBe('review')
    expect(f.release.artifacts[0].attempts).toBe(1)
  })
  it('rejects draft execution without touching persisted release state', async () => {
    const f = fixture()
    await expect(
      executeReleaseSaga(f.payload, { releaseId: 'r', actorId: 'owner' }),
    ).rejects.toThrow('approved')
    expect(f.writes()).toBe(0)
  })
  it('requires approval matching the exact release revision and fingerprint', async () => {
    const f = fixture()
    await pinArtifact(f.payload, 'r', artifact, 'owner')
    approved(f.release)
    f.release.releaseRevision++
    const writes = f.writes()
    await expect(
      executeReleaseSaga(f.payload, { releaseId: 'r', actorId: 'owner' }),
    ).rejects.toThrow('stale')
    expect(f.writes()).toBe(writes)
  })
  it('never reopens a completed release through retry or artifact edits', async () => {
    const f = fixture()
    f.release.status = 'completed'
    f.release.artifacts = [{ status: 'succeeded', attempts: 1 }]
    const result = await executeReleaseSaga(f.payload, {
      releaseId: 'r',
      actorId: 'owner',
      isRetry: true,
    })
    expect(result).toMatchObject({ status: 'completed', succeeded: 1 })
    await expect(pinArtifact(f.payload, 'r', artifact, 'owner')).rejects.toThrow('cannot be edited')
    await expect(unpinArtifact(f.payload, 'r', 'newsletter:mail', 'owner')).rejects.toThrow(
      'cannot be edited',
    )
    expect(f.writes()).toBe(0)
  })
  it('cancels unresolved destination work while retaining already-published posts', async () => {
    const f = fixture()
    f.release.status = 'partially-failed'
    f.release.artifacts = [{ id: 'distribution:d', targetType: 'distribution', status: 'failed' }]
    f.docs['social-queue-items'] = {
      pending: { id: 'pending', status: 'scheduled' },
      published: { id: 'published', status: 'published' },
    }
    await cancelRelease(f.payload, 'r', 'owner')
    expect(f.docs['social-queue-items'].pending.status).toBe('cancelled')
    expect(f.docs['social-queue-items'].published.status).toBe('published')
    expect(f.release.status).toBe('cancelled')
    expect(f.release.artifacts[0].status).toBe('cancelled')
  })
  it('rejects automatic rollback of queued email or completed external sends before writes', async () => {
    const f = fixture()
    f.release.status = 'completed'
    f.release.artifacts = [{ id: 'newsletter:mail', targetType: 'newsletter', status: 'succeeded' }]
    await expect(
      rollbackReleaseSaga(f.payload, { releaseId: 'r', actorId: 'owner', reason: 'Undo' }),
    ).rejects.toThrow('channel reconciliation')
    expect(f.writes()).toBe(0)
  })
  it('cancelled scheduled work is terminal and cannot resume side effects', async () => {
    const f = fixture()
    f.release.status = 'scheduled'
    await cancelRelease(f.payload, 'r', 'owner', 'Operator cancelled')
    const writes = f.writes()
    await expect(
      executeReleaseSaga(f.payload, { releaseId: 'r', actorId: 'owner', isRetry: true }),
    ).rejects.toThrow('cancelled')
    expect(f.writes()).toBe(writes)
  })
  it('pins the distribution destination and presentation snapshot into approval identity', () => {
    const release: any = {
      artifacts: [
        { id: 'a', targetType: 'distribution', targetId: 'd', distributionDraftId: 'one' },
      ],
    }
    const hash = computeReleaseFingerprint(release)
    release.artifacts[0].distributionDraftId = 'two'
    expect(computeReleaseFingerprint(release)).not.toBe(hash)
  })
})
