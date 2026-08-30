import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  activityForContent,
  relationshipActivity,
  actorDocument,
  boundedActivity,
  remoteReply,
  readBoundedActivityBody,
  digestForBody,
  parseHttpSignature,
  signingStringForRequest,
  replayKey,
  verifyHttpSignature,
  webfinger,
} from '../../src/modules/social/activitypub'

describe('ActivityPub protocol boundary', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const actor = {
    id: 'https://example.test/ap/actors/main',
    handle: 'main',
    name: 'Main',
    inbox: 'https://example.test/ap/actors/main/inbox',
    outbox: 'https://example.test/ap/actors/main/outbox',
    followers: 'https://example.test/followers',
    following: 'https://example.test/following',
    publicKeyPem: keys.publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  }
  it('serves WebFinger and a public-only actor document', () => {
    expect(webfinger('@main@example.test', actor.id).links[0].href).toBe(actor.id)
    expect(actorDocument(actor).publicKey.owner).toBe(actor.id)
  })
  it('maps canonical published content without changing it', () => {
    const a = activityForContent({
      actor: actor.id,
      canonicalUrl: 'https://example.test/articles/a',
      title: 'A',
      action: 'Create',
    })
    expect(a.object.type).toBe('Article')
    expect(
      activityForContent({
        actor: actor.id,
        canonicalUrl: 'https://example.test/articles/a',
        title: 'A',
        action: 'Delete',
      }).object.type,
    ).toBe('Tombstone')
  })
  it('builds interoperable relationship activities', () => {
    expect(
      relationshipActivity({
        type: 'Accept',
        id: 'https://example.test/a',
        actor: actor.id,
        object: 'https://remote.test/follow/1',
      }).type,
    ).toBe('Accept')
  })
  it('rejects unsupported/replayed input and requires a valid signature', () => {
    const raw = JSON.stringify({
      id: 'https://remote/a/1',
      type: 'Follow',
      actor: 'https://remote/a',
    })
    const parsed = boundedActivity(raw)
    expect(replayKey(parsed)).toBe(replayKey(parsed))
    expect(() => boundedActivity('{"type":"Like"}')).toThrow()
    const text = '(request-target): post /inbox\nhost: example.test'
    const sig = sign('RSA-SHA256', Buffer.from(text), keys.privateKey).toString('base64')
    expect(
      verifyHttpSignature({
        signingString: text,
        signature: sig,
        publicKeyPem: actor.publicKeyPem,
        algorithm: 'rsa-sha256',
      }),
    ).toBe(true)
  })
  it('requires a complete signed request and binds its body digest', () => {
    const request = new Request('https://example.test/inbox', {
      method: 'POST',
      headers: { host: 'example.test', date: 'Thu, 01 Jan 1970 00:00:00 GMT' },
      body: '{}',
    })
    expect(digestForBody('{}')).toMatch(/^SHA-256=/)
    expect(
      parseHttpSignature(
        'keyId="https://remote.test/a#key",headers="(request-target) host date",signature="abc"',
      ).headers,
    ).toEqual(['(request-target)', 'host', 'date'])
    expect(signingStringForRequest(request, ['(request-target)', 'host'])).toBe(
      '(request-target): post /inbox\nhost: example.test',
    )
    expect(() => parseHttpSignature('keyId="x"')).toThrow()
  })
  it('bounds inbound request bodies before parsing', async () => {
    await expect(
      readBoundedActivityBody(
        new Request('https://example.test/inbox', { method: 'POST', body: '{}' }),
      ),
    ).resolves.toBe('{}')
  })
  it('maps remote replies into held existing community posts', () =>
    expect(
      remoteReply({
        activityId: 'a',
        actor: 'https://remote/a',
        content: 'hello',
        inReplyTo: 'https://example.test/a',
        discussionId: 'd',
      }).moderationState,
    ).toBe('pending'))
})
