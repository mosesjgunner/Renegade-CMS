import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../../src/modules/core/config'
import { readBuildProvenance } from '../../src/modules/core/build-provenance'

const read = vi.hoisted(() => vi.fn())
vi.mock('node:fs', () => ({ readFileSync: read }))
afterEach(() => {
  read.mockReset()
  vi.unstubAllEnvs()
})

describe('artifact source provenance', () => {
  it('ignores a forged runtime SHA when a production artifact is present', () => {
    vi.stubEnv('RENEGADE_ARTIFACT_SHA', '')
    const manifest = {
      sourceSha: 'a'.repeat(40),
      clean: true,
      version: '0.1.0',
      lockfileSha256: 'b'.repeat(64),
    }
    read.mockReturnValue(JSON.stringify(manifest))
    const config = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://operator:unique-long-password@postgres:5432/candidate',
      PAYLOAD_SECRET:
        'unique-production-secret-material-that-is-longer-than-forty-eight-characters',
      APP_URL: 'https://cms.example.test',
      PROXY_MODE: 'trusted',
      MEDIA_DIR: path.resolve('media'),
      BUILD_SHA: 'c'.repeat(40),
    })
    expect(config.buildSha).toBe(manifest.sourceSha)
  })
  it('rejects unknown or malformed artifact metadata', () => {
    read.mockReturnValue(JSON.stringify({ sourceSha: 'unknown', lockfileSha256: 'b'.repeat(64) }))
    expect(readBuildProvenance()).toBeNull()
    read.mockImplementation(() => {
      throw new Error('absent')
    })
    expect(readBuildProvenance()).toBeNull()
  })
})
