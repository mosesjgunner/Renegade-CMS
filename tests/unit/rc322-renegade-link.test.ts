import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  normalizePeerOrigin,
  parseSyndicationEnvelope,
  signSyndicationRequest,
  SyndicationRejection,
  validateSyndicationItem,
  verifySyndicationRequest,
} from '../../src/modules/network/renegade-link'

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const otherPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const otherPublicPem = otherPair.publicKey.export({ type: 'spki', format: 'pem' }).toString()

const ORIGIN = 'https://install-a.rc322.test'
const body = JSON.stringify({
  protocol: 'renegade-link/1',
  kind: 'item',
  sourceOrigin: ORIGIN,
  item: { id: 'post-1', kind: 'post', title: 'Hello', body: 'First syndicated post.' },
})

describe('rc322 renegade link: origin normalization', () => {
  it('accepts a bare https origin and normalizes case/trailing slash', () => {
    expect(normalizePeerOrigin('https://Install-A.rc322.test/')).toBe(ORIGIN)
  })
  it('rejects http, credentials, paths, and query strings', () => {
    for (const bad of [
      'http://install-a.rc322.test',
      'https://user:pass@install-a.rc322.test',
      'https://install-a.rc322.test/path',
      'https://install-a.rc322.test/?x=1',
      'not a url',
      '',
    ])
      expect(() => normalizePeerOrigin(bad)).toThrow(SyndicationRejection)
  })
})

describe('rc322 renegade link: envelope validation', () => {
  it('parses a well-formed envelope', () => {
    const envelope = parseSyndicationEnvelope(body)
    expect(envelope.sourceOrigin).toBe(ORIGIN)
    expect(envelope.item.id).toBe('post-1')
  })
  it('rejects wrong protocol, kind, and malformed JSON', () => {
    expect(() =>
      parseSyndicationEnvelope(body.replace('renegade-link/1', 'renegade-link/2')),
    ).toThrow(SyndicationRejection)
    expect(() => parseSyndicationEnvelope(body.replace('"item"', '"teleport"'))).toThrow(
      SyndicationRejection,
    )
    expect(() => parseSyndicationEnvelope('{nope')).toThrow(SyndicationRejection)
  })
  it('rejects a sourceUrl on a foreign origin but allows one on the source origin', () => {
    expect(() =>
      validateSyndicationItem(
        { id: 'x', kind: 'post', title: 't', body: 'b', sourceUrl: 'https://evil.example/x' },
        ORIGIN,
      ),
    ).toThrow(SyndicationRejection)
    expect(
      validateSyndicationItem(
        { id: 'x', kind: 'post', title: 't', body: 'b', sourceUrl: `${ORIGIN}/posts/x` },
        ORIGIN,
      ).sourceUrl,
    ).toBe(`${ORIGIN}/posts/x`)
  })
  it('rejects oversized and empty fields', () => {
    expect(() =>
      validateSyndicationItem({ id: 'x', kind: 'post', title: '', body: 'b' }, ORIGIN),
    ).toThrow(SyndicationRejection)
    expect(() =>
      validateSyndicationItem(
        { id: 'x', kind: 'post', title: 't', body: 'b'.repeat(50_001) },
        ORIGIN,
      ),
    ).toThrow(SyndicationRejection)
    expect(() =>
      validateSyndicationItem({ id: 'x', kind: 'page', title: 't', body: 'b' }, ORIGIN),
    ).toThrow(SyndicationRejection)
  })
})

describe('rc322 renegade link: request signing', () => {
  it('verifies a signature from the matching key', () => {
    const { date, signature } = signSyndicationRequest(privatePem, body)
    expect(verifySyndicationRequest(publicPem, { rawBody: body, date, signature })).toBe(true)
  })
  it('rejects a tampered body, a wrong key, and a stale date', () => {
    const { date, signature } = signSyndicationRequest(privatePem, body)
    expect(
      verifySyndicationRequest(publicPem, {
        rawBody: body.replace('Hello', 'Forged'),
        date,
        signature,
      }),
    ).toBe(false)
    expect(verifySyndicationRequest(otherPublicPem, { rawBody: body, date, signature })).toBe(false)
    const stale = signSyndicationRequest(privatePem, body, new Date(Date.now() - 10 * 60_000))
    expect(
      verifySyndicationRequest(publicPem, {
        rawBody: body,
        date: stale.date,
        signature: stale.signature,
      }),
    ).toBe(false)
  })
})
