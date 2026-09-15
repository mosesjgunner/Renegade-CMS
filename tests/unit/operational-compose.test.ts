import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { composeArgs, projectNameFromEnvFile } from '../../src/scripts/operational-compose'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('operational Compose targeting', () => {
  it('uses the instance persisted with the production environment for every operational command', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'renegade-compose-'))
    roots.push(root)
    const envFile = path.join(root, '.env.production')
    await writeFile(envFile, 'RENEGADE_INSTANCE=fartwater\n')

    expect(projectNameFromEnvFile(envFile)).toBe('fartwater')
    expect(composeArgs({ envFile, composeFile: 'compose.production.yaml' })).toEqual([
      'compose',
      '--project-name',
      'fartwater',
      '--env-file',
      envFile,
      '-f',
      'compose.production.yaml',
    ])
  })

  it('uses the legacy project identity when an older environment has no instance field', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'renegade-compose-'))
    roots.push(root)
    const envFile = path.join(root, '.env.production')
    await writeFile(envFile, 'APP_URL=https://cms.example.test\n')

    expect(projectNameFromEnvFile(envFile)).toBe('renegade-cms')
  })
})
